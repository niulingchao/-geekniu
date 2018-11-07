/**
 * Created by yuanyuan on 17/10/16.
 */
const ZHMDCollector     = require('../../index');
const log4js            = ZHMDCollector.getConfig().log4js;
const logger            = log4js.log4js.getLogger('service');
const redis             = require('redis');
const Config            = ZHMDCollector.getConfig();
const bluebird          = require('bluebird');
const moment            = require('moment');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

let  client = redis.createClient({
    host:Config.baas_config.redis_experience_percent.host,
    port:Config.baas_config.redis_experience_percent.port
});

const IS_ERROR_YES = 1;
const IS_LAST_FLAG_KEY   = "last_key";
const IS_LAST_FLAG_VALUE = 1;
const DATA_KEY = "data";
const DATA_TYPE_FREE = 2;
const DATA_TYPE_EXPERIENCE = 1;
const DATA_TYPE_ALLOW = [DATA_TYPE_FREE,DATA_TYPE_EXPERIENCE];
const INFINITE = -1;
const REDIS_DELETE_FLAG = '_delete_';

function log(function_name,msg,is_error) {
    if(is_error === IS_ERROR_YES){
        logger.error(`experience_percent_handle function_name=${function_name} msg = ${msg}`);
    }else{
        logger.info(`experience_percent_handle function_name=${function_name} msg = ${msg}`);
    }
}
//{"data":{},"last_key":1}
async function insert_queue(sensor_items) {
    log('insert_queue',JSON.stringify(sensor_items));
    if(Array.isArray(sensor_items) && sensor_items.length > 0){
        for(let i = 0;i < sensor_items.length;i++){
            if(sensor_items[i].mac_address && DATA_TYPE_ALLOW.includes(sensor_items[i].data_type)){
                await client.rpushAsync(sensor_items[i].mac_address,JSON.stringify({
                    [DATA_KEY]: sensor_items[i]
                }));
            }
        }
    }
}

async function calculate_experience_percent_value(fn) {
    const mac_address_arr = await client.keysAsync('*');
    if(mac_address_arr.length > 0){
        await bluebird.map(mac_address_arr,async mac_address => {
            await calculate_experience_percent_value_mac_address(mac_address,fn);
        })
    }
}

async function calculate_experience_percent_value_mac_address(mac_address,fn,fail_fn) {
    const data_source = await client.lrangeAsync(mac_address,'0','-1');
    log('calculate_experience_percent_value',`mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);

    if(!Array.isArray(data_source) || data_source.length < 2){
        return;
    }

    const datas = data_source.map(data => {
        try{
            return JSON.parse(data);
        }catch (e){
            log('calculate_experience_percent_value',`mac_address = ${mac_address} ,JSON.parse error, data =  ${JSON.stringify(data)} ,type = ${typeof data}`);
        }
    });

    const first_data = datas.shift();

    const format_datas = datas.map(data => {
        return data[DATA_KEY];
    });

    let pre_item = get_pre_item(first_data);
    let pre_item_have_flag = false;
    if(pre_item === null){
        pre_item = first_data[DATA_KEY];
        format_datas.unshift(first_data[DATA_KEY]);
        pre_item_have_flag = true;
    }

    format_datas.sort((a,b) => {
        return a.timestamp > b.timestamp ? 1:-1;
    });

    //考虑离线包的情况,截断format_datas,以5分钟时间戳
    const format_datas_arr = split_five_min_datas(format_datas);

    for(let format_datas_item of format_datas_arr){
        const map    = new Map();

        for(let i = 0;i < format_datas_item.length;i++){
            if(pre_item_have_flag){
                pre_item_have_flag = false;
                continue;
            }

            const time = calculate_time(pre_item,format_datas_item[i]);

            if(map.has(format_datas_item[i].data_type)){
                map.set(format_datas_item[i].data_type,map.get(format_datas_item[i].data_type) + time);
            }else{
                map.set(format_datas_item[i].data_type,time);
            }

            pre_item = format_datas_item[i];
        }

        const flag = calculate_percent(map);

        if(flag){
            log('calculate_experience_percent_value',`mac_address = ${mac_address} ,fn handle, format_datas = ${JSON.stringify(format_datas_item)}`);
            await fn(format_datas_item);
        }else{
            log('calculate_experience_percent_value',`mac_address = ${mac_address} ,remove format_datas handle, format_datas = ${JSON.stringify(format_datas_item)}`);
        }
    }

    await remove_datas(mac_address,data_source);
    await save_last_data(mac_address,format_datas[format_datas.length - 1]);
}

function split_five_min_datas(datas) {
    const time_interval = 300000;
    const time_interval_min = 300000 / 60000;
    const first_timestamp = datas[0].timestamp;
    const last_timestamp  = datas[datas.length - 1].timestamp;

    const first_timestamp_start = get_near_on_a_time_interval(first_timestamp,time_interval_min);
    const last_timestamp_end = moment(last_timestamp).endOf('minute').valueOf();

    const loop = parseInt((last_timestamp_end - first_timestamp_start) / time_interval) + 1;

    if(loop <= 1){
        return [datas];
    }

    const result_arr = [];
    for(let i = 0;i < loop;i++){
        const item_arr = [];
        const start_time = first_timestamp_start + (time_interval * i);
        const end_time   = first_timestamp_start + (time_interval * (i+1));

        for(let data of datas){
            if(start_time <= data.timestamp && data.timestamp < end_time){
                item_arr.push(data);
            }
        }

        if(item_arr.length > 0){
            result_arr.push(item_arr);
        }
    }
    return result_arr;
}

function get_near_on_a_time_interval(time,time_interval) {
    const cur_time_min = parseInt(moment(time).startOf('minute').format('mm'));
    const min = parseInt(cur_time_min / time_interval) * time_interval;

    return moment(time).minute(min).startOf('minute').valueOf();
}


async function save_last_data(mac_address,data) {
    log('save_last_data',`mac_address = ${mac_address}, data = ${JSON.stringify(data)}`);
    await client.lpushAsync(mac_address,JSON.stringify({
        [DATA_KEY]: data,
        [IS_LAST_FLAG_KEY]: IS_LAST_FLAG_VALUE
    }));
}

async function remove_datas(mac_address,data_source) {
    log('remove_datas',`mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);
    for (let i = 0; i < data_source.length; i++) {
        await client.lsetAsync(mac_address,i,REDIS_DELETE_FLAG);
    }
    await  client.lremAsync(mac_address,0,REDIS_DELETE_FLAG);
}

function get_pre_item(first_data) {
    if(first_data[IS_LAST_FLAG_KEY] === IS_LAST_FLAG_VALUE){
        return first_data[DATA_KEY];
    }else{
        return null;
    }
}

function calculate_time(pre_item,cur_item) {
    if(pre_item.data_type !== cur_item.data_type){
        let time_interval = cur_item.timestamp - pre_item.timestamp;
        if(cur_item.data_type === DATA_TYPE_FREE && time_interval > (5 * 60 * 1000)){
            //当空闲间隔大于5分钟时,要重置
            time_interval = cur_item.timestamp - get_near_on_a_time_interval(cur_item.timestamp,5);
        }

        return time_interval;
    }else{
        return 0;
    }
}

function calculate_percent(map) {
    const free_total_time = map.get(DATA_TYPE_FREE) || 0;
    const experience_total_time = map.get(DATA_TYPE_EXPERIENCE) || 0;
    let experience_percent = 0;

    if(free_total_time === 0 && experience_total_time === 0){
        experience_percent = 0;
    }else if(free_total_time === 0){
        experience_percent = INFINITE;
    }else if(experience_total_time === 0){
        experience_percent = 0;
    }else{
        experience_percent = parseFloat((experience_total_time / free_total_time).toFixed(2));
    }

    log('calculate_percent',`experience_percent = ${experience_percent} ,experience_total_time = ${experience_total_time}`);

    if(experience_percent === INFINITE || experience_percent === 0 || experience_percent <= 1 || (experience_percent > 1 && experience_total_time < 30 * 1000)){
        return true;
    }else{
        return false;
    }
}

module.exports = {
    insert_queue,calculate_experience_percent_value
};