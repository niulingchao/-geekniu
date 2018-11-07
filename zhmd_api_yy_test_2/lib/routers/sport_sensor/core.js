const ZHMDCollector     = require('../../index');
const log4js            = ZHMDCollector.getConfig().log4js;
const logger            = log4js.log4js.getLogger('service');
const redis             = require('redis');
const Config            = ZHMDCollector.getConfig();
const bluebird          = require('bluebird');
const moment            = require('moment');
const lodash            = require('lodash');
const slayer            = require('./slayer/');
const Data              = ZHMDCollector.getModel().Data;
const Keygen            = ZHMDCollector.getModel().Keygen;
const model_util        = require('../../common/model_util');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const {redis_queue_host,redis_queue_port,minPeakHeight = 0.2,minPeakDistance = 10,minPackageContinue = 5000,minValidPeakHeight = 0.1} = Config.baas_config.sport_sensor_config

let  client = redis.createClient({
    host:redis_queue_host,
    port:redis_queue_port
});

const REDIS_DELETE_FLAG = '_delete_';
const IS_ERROR_YES = 1;

function log(function_name,msg,is_error) {
    if(is_error === IS_ERROR_YES){
        logger.error(`report_sensor function_name=${function_name} msg = ${msg}`);
    }else{
        logger.info(`report_sensor function_name=${function_name} msg = ${msg}`);
    }
}

async function insert_queue(sensor_items) {
    log('insert_queue',JSON.stringify(sensor_items));
    if(Array.isArray(sensor_items) && sensor_items.length > 0){
        for(let i = 0;i < sensor_items.length;i++){
            if(sensor_items[i].mac_address){
                sensor_items[i].mac_address = sensor_items[i].mac_address.toLowerCase()
                const flag = await mac_address_is_match_ipad_token(sensor_items[i].mac_address,sensor_items[i].server_ipad_token);
                if(!flag){
                    log(`insert_queue`,`mac_address not_match server_ipad_token ,mac_address = ${sensor_items[i].mac_address} ,server_ipad_token = ${sensor_items[i].server_ipad_token}, sensor_item:${JSON.stringify(sensor_items[i])}`);
                    continue;
                }

                await client.rpushAsync(sensor_items[i].mac_address,JSON.stringify(sensor_items[i]));
                try{
                    await handle_mac_address_queue(sensor_items[i].mac_address);
                }catch(e){
                    log(`insert_queue`,e.toString());
                }
            }
        }
    }
}

async function handle_mac_address_queue(mac_address){
    const time = new Date().getTime();
    const datas = await client.lrangeAsync(mac_address,'0','-1');
    if(datas.length <= 2){
        return;
    }

    const datas_obj = datas.map(item => {
        item = JSON.parse(item);
        item.a = parseFloat(item.a);

        return item;
    });
    datas_obj.sort((a,b) => {
        return a.timestamp > b.timestamp ? 1: -1;
    })

    const temp_datas_arr = [];
    for(let i  = (datas_obj.length -1);i >= 0;i--){
        if(datas_obj[i].a < minPeakHeight){
            temp_datas_arr.push(datas_obj[i]);
        }else{
            break;
        }
    }

    let time_interval = 0;
    if(temp_datas_arr.length > 0){
        time_interval = temp_datas_arr[0].timestamp - temp_datas_arr[temp_datas_arr.length - 1].timestamp;
    }
    
    if(temp_datas_arr.length === 0 || time_interval < minPackageContinue){
        return;
    }

    const a_arr = datas_obj.map(item => item.a);
    const time1 = new Date().getTime();
    let peak_arr = slayer({minPeakHeight,minPeakDistance}).fromArray(a_arr);
    peak_arr = peak_arr.map((item) => {
        item.experience_time = cal_expreience_time(item.x,datas_obj,minPeakDistance,minValidPeakHeight);

        return item;
    });
    const time2 = new Date().getTime();
    log(`handle_mac_address_queue`,`mac_address = ${mac_address} ,slayer timeout = ${time2 - time1} ,peak_arr = ${JSON.stringify(peak_arr)}`);
    
    if(peak_arr.length > 0){
        const valid_datas = peak_arr.map(item => {
            let data = datas_obj[item.x];
            data.experience_time = item.experience_time;

            return data;
        });

        //在连续的continue之间,选取最大一个波峰为有效值
        const max = lodash.maxBy(valid_datas,function (item) {
            return item.a;
        })
        const total_experience_time = lodash.sumBy(valid_datas,function (item) {
            return item.experience_time;
        })
        max.experience_time = total_experience_time;

        await insert_valid_datas([max]);
    }

    await remove_datas(mac_address,datas);
    const end_time = new Date().getTime();

    log(`handle_mac_address_queue`,`mac_address = ${mac_address} ,timeout = ${end_time - time}`);
}

async function insert_valid_datas(valid_datas){
    log(`insert_valid_datas`,`valid_datas = ${JSON.stringify(valid_datas)}`);
    const sensor_report = require('../sensor/sensor_report');
    for(let valid_data of valid_datas){
        await sensor_report.inner_sport_sensor_report(valid_data);
    }
}

async function remove_datas(mac_address,data_source) {
    log('remove_datas',`mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);
    for (let i = 0; i < data_source.length; i++) {
        await client.lsetAsync(mac_address,i,REDIS_DELETE_FLAG);
    }
    await  client.lremAsync(mac_address,0,REDIS_DELETE_FLAG);
}

async function mac_address_is_match_ipad_token(mac_address,server_ipad_token) {
    const query = {
        "$and": [
            { "data.mac_address": mac_address },
            { "data.state": 2 },
            {
                "$or": [
                    { "data.server_ipad_token": server_ipad_token },
                    { "data.server_ipad_token": "" }, // token 为空
                    { "data.server_ipad_token": { "$exists": false } } // server_ipad_token 不存在
                ]
            }
        ]
    };
    const sensor = await model_util.find_one_doc_from_Data('sensor',query);

    if (sensor){
        const server_ipad_token_sensor = sensor.data.server_ipad_token;
        if (server_ipad_token_sensor === ''|| server_ipad_token_sensor === undefined || server_ipad_token_sensor === null){
            const rs = await Data('sensor').findOneAndUpdate({'data.mac_address':mac_address,'data.state':2},{$set:{
                'data.server_ipad_token':server_ipad_token
            }}).exec();
        }
    }

    return sensor === null ? false:true;
}


function cal_expreience_time(i,arr,minPeakDistance,minValidPeakHeight){
    let start = i - 1;
    let end = i + 1;
    for(let j = i - minPeakDistance;j < i ;j++){
        if(arr[j] && arr[j].a > minValidPeakHeight){
            start = j;
            break;
        }
    }

    for(let j = i + minPeakDistance;j > i ;j--){
        if(arr[j] && arr[j].a > minValidPeakHeight){
            end = j;
            break;
        }
    }
    if(arr[end] && arr[start]){
        return arr[end].timestamp - arr[start].timestamp;
    }else{
        return 0;
    }
}


module.exports = {
    insert_queue
};