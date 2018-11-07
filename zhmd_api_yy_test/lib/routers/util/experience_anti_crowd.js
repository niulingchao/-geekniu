const model_util = require('../../common/model_util')
const moment = require('moment');
const md5 = require('md5');
const Code   = require('../../common/error_code');
const  ZHMDCollector = require('../../index');
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  global_util = require('../../common/assists');
const redis = require('redis');
const process = require('process')
const Promise = require("bluebird");
const Redis_queue = require(process.cwd() + "/analysis/lib/redis_event_queue")
const Config = ZHMDCollector.getConfig();
const queue_name = Config.baas_config.analysis_config.analysis_redis_queue_event_name;
const normal_util = require('normalutil');

const MAX_CROWD_COUNTER = 50 ;
const REDIS_DELETE_FLAG = '_delete_';
const LOG_FLAG = 'experience_anti_crowd';


let  client = redis.createClient({
    host:Config.baas_config.redis_experience_anti_crowd.host,
    port:Config.baas_config.redis_experience_anti_crowd.port
});

const handle_crowd = async function (shop_id,time_stamp,event_data) {
    let time = getTime(time_stamp);
    let key = getRedisKey(shop_id,time.start,time.end);
    let first = await first_flag(key);
    if (first) {
        await Redis_queue.send_event_data(queue_name, event_data);
    } else {
        await client.rpushAsync(key,JSON.stringify(event_data));
    }

};


const handle_experience = async function (shop_id,time_stamp,event_data) {
    let time = getTime(time_stamp);
    let key = getRedisKey(shop_id,time.start,time.end);
    let first = await client.lindexAsync(key,'0');
    if ( first === '1') {

    } else if (first === '0') {
        await client.lsetAsync(key,'0','1');
    }else {
        await client.lpushAsync(key,'1');
    }


    //不敢用while,怕死循环,用一个较大的值来出来循环.
    for(let i = 0;i < 10000;i++){
        const data = await client.rpopAsync(key);
        if(data === '1' || data === null){
            await client.lpushAsync(key,'1');
            break;
        }else{
            logger.info(` ${LOG_FLAG} handle_experience 构建事件数据 ${data}`);
            await Redis_queue.send_event_data(queue_name, JSON.parse(data));
        }

        if(i === 9999){
            logger.error(`${LOG_FLAG} handle_experience Error,key = ${key} ${data}`);
        }
    }

    await Redis_queue.send_event_data(queue_name, event_data);
};
//删除list中 从第二个元素开始 指定len条数的数据
async function remRedisList(key,len) {
    logger.info(`${LOG_FLAG} remRedisList   key = ${key} len = ${len}`)
    for (let i = 1; i<len+1 ;i++ ) {
        await client.lsetAsync(key,i,REDIS_DELETE_FLAG);
    }
    await  client.lremAsync(key,0,REDIS_DELETE_FLAG);
}
const handle_queue_ten_minutes_ago = async function () {
    const query = {"data.status": 1};
    let rs = await model_util.find_docs_form_Data('shop_experience_strategy',query);
    let time = getTime(new Date().getTime());
    let start = time.start - 1200000;
    let end = time.start - 600000;

    await Promise.map(rs,async function(item){
        let key = getRedisKey(item.data.shop_id ,start,end );
        await handle_queue(key);
    });

};

const handle_queue_day = async function () {
    let keys = await client.keysAsync('*');
    await Promise.map(keys,async function(key){
        await handle_queue(key);
    });
};

async function handle_queue(key) {
    if (!await first_flag(key)) {
        let arr = splitRedisKey(key);
        let shop_info = await  get_one_shop(arr[0]);
        if (!shop_info) {
            return;
        }
        let count = await calcute_crowd_count(key);
        // 大于店铺默认
        if (count > shop_info.data.max_crowd_number  ) {//清空队列
            let len = await client.llenAsync(key);
            logger.info(`${LOG_FLAG} remRedisList filter crowd  key = ${key} len = ${len - 1} real_count = ${count}`)
            await client.ltrimAsync(key,'0','0');
        } else { //客流消息入库
            await send_event_data(key);
        }
    }else{
        let len = await client.llenAsync(key);
        if (len > 1) {
            await send_event_data(key);
        }
    }
}

async  function send_event_data(key) {
    let list = await client.lrangeAsync(key, '1', '-1');
    await remRedisList(key,list.length);
    list.map(async function (item) {
        logger.info(`${LOG_FLAG} send_event_data 构建事件数据 ${item}`)
        await Redis_queue.send_event_data(queue_name, JSON.parse(item));
    });
}

async function calcute_crowd_count(key) {
    let list = await client.lrangeAsync(key, '1', '-1');
    let num = 0 ;
    list.forEach(function (item) {
        if (item && normal_util.isJson(item) && normal_util.isNumber(JSON.parse(item).event_attr.customer_flow_ration)) {
            num += JSON.parse(item).event_attr.customer_flow_ration;
        }
    });
    return Math.floor(num);
}
async function first_flag (key) {
    let first =  await client.lindexAsync(key,'0');
    if (first === '1') {
        return true;
    } else if (first === '0') {
        return false;
    } else {
        await  client.lpushAsync(key,'0');
        return false;
    }
}

function getTime(timestamp) {
    let str = moment(timestamp).format('YYYY-MM-DD HH:mm');
    let start = Date.parse(new Date(str.substr(0,15)+'0:00'));
    let end = start + 600000;
    return {
      "start":start,
        "end":end
    };
}
async  function get_one_shop(shop_id) {
    let query = {"data.status": 1 ,"data.shop_id":parseInt(shop_id)};
    return await model_util.find_one_doc_from_Data('shop_experience_strategy',query);
}
/*
 key 不做md5
 从 key 分割出 shop_id
 handle_queue 时 通过shop_id 查询 max_crowd_number
  */
function getRedisKey(shopid,start,end) {
    return shopid + '_' + start + '_' + end;
}

function splitRedisKey(key) {
    return key.split('_');
}

module.exports = {
    handle_crowd,
    handle_experience,
    get_one_shop,
    handle_queue_day,
    handle_queue_ten_minutes_ago
};