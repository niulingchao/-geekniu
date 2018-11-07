const model_util                = require('../../common/model_util')
const moment                    = require('moment');
const md5                       = require('md5');
const Code                      = require('../../common/error_code');
const ZHMDCollector             = require('../../index');
const log4js                    = ZHMDCollector.getConfig().log4js;
const logger                    = log4js.log4js.getLogger('service');
const global_util               = require('../../common/assists');
const redis                     = require('redis');
const process                   = require('process')
const Promise                   = require("bluebird");
const Redis_queue               = require(process.cwd() + "/analysis/lib/redis_event_queue")
const Config                    = ZHMDCollector.getConfig();
const queue_name                = Config.baas_config.analysis_config.analysis_redis_queue_event_name;
const normal_util               = require('normalutil');
const numeral                   = require('numeral');

const MAX_CROWD_COUNTER = 50 ;
const REDIS_DELETE_FLAG = '_delete_';
const LOG_FLAG = 'experience_anti_crowd';
const CROWD_TYPE = 1;
const EXPERIENCE_TYPE = 2;


let  client = redis.createClient({
    host:Config.baas_config.redis_experience_anti_crowd.host,
    port:Config.baas_config.redis_experience_anti_crowd.port
});

const handle_crowd = async function (shop_id,time_stamp,event_data) {
    let time = get_near_on_a_time_interval(time_stamp);
    let key = getRedisKey(shop_id,time.start,time.end);

    logger.info(`${LOG_FLAG} handle_crowd insert data = ${JSON.stringify(event_data)}`);
    await client.rpushAsync(key,JSON.stringify({
        'type': CROWD_TYPE,
        event_data
    }));

};


const handle_experience = async function (shop_id,time_stamp,event_data) {
    let time = get_near_on_a_time_interval(time_stamp);
    let key = getRedisKey(shop_id,time.start,time.end);

    logger.info(`${LOG_FLAG} handle_experience insert data = ${JSON.stringify(event_data)}`);
    await client.rpushAsync(key,JSON.stringify({
        'type': EXPERIENCE_TYPE,
        event_data
    }));
};


async function remRedisList(key,len) {
    logger.info(`${LOG_FLAG} remRedisList   key = ${key} len = ${len}`)
    for (let i = 0; i < len;i++ ) {
        await client.lsetAsync(key,i,REDIS_DELETE_FLAG);
    }
    await  client.lremAsync(key,0,REDIS_DELETE_FLAG);
}

const handle_queue_five_minutes_ago = async function () {
    const query = {"data.status":{"$in": [1,2]}};
    let rs = await model_util.find_docs_form_Data('shop_experience_strategy',query);
    let time = get_near_on_a_time_interval(new Date().getTime());
    let start = time.start - 600000;
    let end = time.start - 300000;

    logger.info(`${LOG_FLAG} handle_queue_five_minutes_ago start,rs  = ${JSON.stringify(rs)}`);
    await Promise.map(rs,async function(item){
        let key = getRedisKey(item.data.shop_id ,start,end );
        await handle_queue(key,item.data.status);
    });

};

const handle_queue_day = async function () {
    let keys = await client.keysAsync('*');
    await Promise.map(keys,async function(key){
        const shop_id = get_shop_id_by_redis_key(key);
        const shop    = await get_one_shop(shop_id);
        if(shop){
            await handle_queue(key,shop.data.status);
        }
    });
};

async function handle_queue(key,status) {
    let {crowd_num,experience_num,datas,crowd_datas,experience_datas}  = await calculate_crowd_experience_count(key);

    if(status === 1){
        if(crowd_num >= 4 && experience_num === 0){
            logger.info(`${LOG_FLAG} handle_queue ,status = ${status} ,remRedisList crowd_num = ${crowd_num},experience_num = ${experience_num}, datas = ${JSON.stringify(datas)}`);
            await remRedisList(key,datas.length);
        }else{
            logger.info(`${LOG_FLAG} handle_queue ,status = ${status} ,send_event_data crowd_num = ${crowd_num},experience_num = ${experience_num}, datas = ${JSON.stringify(datas)}`);
            await send_event_data(key,datas);
        }
    }else if(status === 2){
        let percent = experience_num / crowd_num;
        if(crowd_num >= 4 && experience_num === 0){
            logger.info(`${LOG_FLAG} handle_queue ,status = ${status} ,remRedisList crowd_num = ${crowd_num},experience_num = ${experience_num}, datas = ${JSON.stringify(datas)}`);
            await remRedisList(key,datas.length);
        }else if(percent > 0 && percent < 0.2){
            let len = experience_datas.length;
            crowd_datas = crowd_datas.slice(0,len);
            datas = experience_datas.concat(crowd_datas);

            await send_event_data(key,datas);
            logger.info(`${LOG_FLAG} handle_queue ,status = ${status} ,send_event_data meet_percent crowd_num = ${crowd_num},experience_num = ${experience_num}, datas = ${JSON.stringify(datas)}`);
        }else{
            logger.info(`${LOG_FLAG} handle_queue ,status = ${status} ,send_event_data crowd_num = ${crowd_num},experience_num = ${experience_num}, datas = ${JSON.stringify(datas)}`);
            await send_event_data(key,datas);
        }
    }else{
        //什么也不做,留做扩展吧
    }
}

async  function send_event_data(key,datas) {
    await remRedisList(key,datas.length);

    await Promise.map(datas,async data => {
        await Redis_queue.send_event_data(queue_name, data);
    });
}

async function calculate_crowd_experience_count(key) {
    let list = await client.lrangeAsync(key, '0', '-1');
    logger.info(`${LOG_FLAG} calculte_crowd_experience_count start,list = ${list}`);

    let crowd_num = 0 ;
    let experience_num = 0;
    let datas = [];
    let crowd_datas = [];
    let experience_datas = [];
    list.forEach(function (item) {
        if(normal_util.isJson(item)){
            try{
                item = JSON.parse(item);
            }catch (e){}

            if(item && item.type === CROWD_TYPE && item.event_data && item.event_data.event_attr && item.event_data.event_attr.customer_flow_ration && normal_util.isNumber(item.event_data.event_attr.customer_flow_ration)){
                let customer_flow_ration = parseFloat(item.event_data.event_attr.customer_flow_ration);
                crowd_num = numeral(crowd_num).add(customer_flow_ration).value();

                datas.push(item.event_data);
                crowd_datas.push(item.event_data);
            }else if(item && item.type === EXPERIENCE_TYPE && item.event_data.event === "sensor_report"){
                experience_num += 1;

                datas.push(item.event_data);
                experience_datas.push(item.event_data);
            }else if(item && item.type === EXPERIENCE_TYPE && item.event_data.event === "experience_time_report"){
                //体验时长不影响计算
                datas.push(item.event_data);
            }else{
                logger.info(`${LOG_FLAG} calculte_crowd_experience_count item not format, item = ${JSON.stringify(item)}`);
            }


        }
    });

    logger.info(`${LOG_FLAG} calculte_crowd_experience_count end,crowd_num = ${crowd_num}, experience_num = ${experience_num} ,datas = ${JSON.stringify(datas)}`);

    return {crowd_num,experience_num,datas,crowd_datas,experience_datas};
}

function get_near_on_a_time_interval(time,time_interval) {
    if(!normal_util.isNumber(time_interval)) time_interval = 5;
    const cur_time_min = parseInt(moment(time).startOf('minute').format('mm'));
    const min = parseInt(cur_time_min / time_interval) * time_interval;

    const start = moment(time).minute(min).startOf('minute').valueOf();
    const end = start + time_interval * 60 * 1000;
    return {start,end};
}

async  function get_one_shop(shop_id) {
    let query = {"data.status": {"$in":[1,2]} ,"data.shop_id":parseInt(shop_id)};
    return await model_util.find_one_doc_from_Data('shop_experience_strategy',query);
}


function getRedisKey(shopid,start,end) {
    return shopid + '_' + start + '_' + end;
}

function get_shop_id_by_redis_key(key) {
    return key.split('_')[0];
}

module.exports = {
    handle_crowd,
    handle_experience,
    get_one_shop,
    handle_queue_day,
    handle_queue_five_minutes_ago
};