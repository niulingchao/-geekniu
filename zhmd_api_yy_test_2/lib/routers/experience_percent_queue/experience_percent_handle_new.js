/**
 * Created by yuanyuan on 17/10/16.
 */
const ZHMDCollector = require('../../index');
const log4js = ZHMDCollector.getConfig().log4js;
const logger = log4js.log4js.getLogger('service');
const redis = require('redis');
const Config = ZHMDCollector.getConfig();
const bluebird = require('bluebird');
const moment = require('moment');
const TimingTask = require('../util/timing_task');
const RedisLock = require('../util/redis_lock');
const model_util = require('../../common/model_util');
const fs = require('fs');
const process = require('process');
const lodash = require('lodash');
const Data = ZHMDCollector.getModel().Data;
const ExperienceIntrevalUtil = require('../util/experience_interval');


bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

let client = redis.createClient({
    host: Config.baas_config.redis_experience_percent_new.host,
    port: Config.baas_config.redis_experience_percent_new.port
});

const IS_ERROR_YES = 1;
const IS_LAST_FLAG_KEY = "last_key";
const IS_LAST_FLAG_VALUE = 1;
const DATA_KEY = "data";
const DATA_TYPE_FREE = 2;
const DATA_TYPE_EXPERIENCE = 1;
const DATA_TYPE_ALLOW = [DATA_TYPE_FREE, DATA_TYPE_EXPERIENCE];
const INFINITE = -1;
const REDIS_DELETE_FLAG = '_delete_';
const REDIS_KEY_EXPIRE_TIME = 5;
const EXPERIENCE_FREE_TIME_MIN = 1100;
const EXPERIENCE_TIME_MAX = 30 * 60 * 1000;
const FREE_TIME_MAX = 30 * 60 * 1000;
const FREE_TIME_MIN = 2 * 60 * 1000;
const RESET_TIMEING_TASK_INTERVAL = 5 * 60 * 1000;
const CUR_TIME_DEFAULT = -1;
const Constants = {
    'MESSAGE': {
        'MESSAGE_TYPE_ROUTER_RELOAD': 'router_reload',
        'MESSAGE_TYPE_ROUTER_REMOVE': 'router_remove',
        'MESSAGE_TYPE_ROUTER_SENSOR_RESET_TASK': 'sensor_rest_task'

    },
    'SCHEDULE': {
        'SCHEDULE_WORKER': 'schedule',
        'SCHEDULE_STATUS': '1'
    }
};

class Message {
    constructor(worker_pid, message_type, message_id, content) {
        this.worker_pid = worker_pid;
        this.message_type = message_type;
        this.timestamp = new Date().getTime();
        this.message_id = message_id;
        this.content = content;
    }

    toObject() {
        return {
            'worker_pid': this.worker_pid,
            'message_type': this.message_type,
            'timestamp': this.timestamp,
            'message_id': this.message_id,
            'content': this.content,
        }
    }
}

process.on('message', function(message) {
    logger.log(`worker..... receive msg = ${JSON.stringify(message)}....worker_id = ${process.pid}`);
    if (typeof message === 'object') {
        if (message.message_type === Constants.MESSAGE.MESSAGE_TYPE_ROUTER_SENSOR_RESET_TASK) {

            if (lodash.get(process.env, Constants.SCHEDULE.SCHEDULE_WORKER) === Constants.SCHEDULE.SCHEDULE_STATUS) {

                const mac_address = message.content;
                const key = `${mac_address}_reset_time`;

                TimingTask.reset_task(key, RESET_TIMEING_TASK_INTERVAL, crontab_task, mac_address);

            }
        }
    }
});

function log(function_name, msg, is_error) {
    if (is_error === IS_ERROR_YES) {
        logger.error(`experience_percent_handle_new function_name=${function_name} msg = ${msg}`);
    } else {
        logger.info(`experience_percent_handle_new function_name=${function_name} msg = ${msg}`);
    }
}

async function insert_queue(sensor_items) {
    if (sensor_items.length === 0) return;
    sensor_items.sort((a, b) => {
        return a.timestamp - b.timestamp > 0 ? 1 : -1;
    })
    log('insert_queue', JSON.stringify(sensor_items));
    for (let sensor_item of sensor_items) {
        if (sensor_item.mac_address && DATA_TYPE_ALLOW.includes(sensor_item.data_type)) {
            const flag = await mac_address_is_match_ipad_token(sensor_item.mac_address,sensor_item.server_ipad_token);
            if(!flag){
                log(`insert_queue`,`mac_address not_match server_ipad_token ,mac_address = ${sensor_item.mac_address} ,server_ipad_token = ${sensor_item.server_ipad_token}, sensor_item:${JSON.stringify(sensor_item)}`);
                continue;
            }
            await RedisLock.get_lock(client, get_redis_key_lock(sensor_item.mac_address), REDIS_KEY_EXPIRE_TIME);
            await client.rpushAsync(sensor_item.mac_address, JSON.stringify({
                [DATA_KEY]: sensor_item
            }));
            await cal_insert_logic(sensor_item.mac_address);
        }
    }
}

async function calculate_experience_percent_value() {
    const mac_address_arr = await client.keysAsync('*');
    if (mac_address_arr.length > 0) {
        await bluebird.map(mac_address_arr, async mac_address => {
            if (mac_address && !mac_address.includes("_redis_lock_key")) {
                await crontab_task(mac_address);
            }
        })
    }
}

async function calculate_index_for_mac_address(mac_address) {
    const data_source = await client.lrangeAsync(mac_address, '0', '-1');
    log('calculate_index_for_mac_address', `mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);

    const datas = data_source.map(data => {
        try {
            return JSON.parse(data);
        } catch (e) {
            log('calculate_index_for_mac_address', `mac_address = ${mac_address} ,JSON.parse error, data =  ${JSON.stringify(data)} ,type = ${typeof data}`);
        }
    });

    const first_data = datas.shift();

    const format_datas = datas.map(data => {
        return data[DATA_KEY];
    });

    let pre_item = get_pre_item(first_data);
    let pre_item_have_flag = false;
    let is_first_data = 0;
    if (pre_item === null) {
        format_datas.unshift(first_data[DATA_KEY]);
        pre_item = first_data[DATA_KEY];
        pre_item_have_flag = true;
        if(format_datas.length === 1){
            //第一次拿起
            is_first_data = 1;
        }else if(format_datas.length === 2){
            //第一次放下(已经有对应上一次拿起了)
            is_first_data = 2;
        }else{
            is_first_data = 0;
        }
    }

    format_datas.sort((a, b) => {
        return a.timestamp > b.timestamp ? 1 : -1;
    });

    const map = new Map();
    let cur_time = CUR_TIME_DEFAULT;
    let down_count = 0;

    log('calculate_index_for_mac_address', `mac_address = ${mac_address} ,format_datas = ${JSON.stringify(format_datas)}`);
    for (let i = 0; i < format_datas.length; i++) {
        if (format_datas[i].data_type === DATA_TYPE_EXPERIENCE) {
            down_count++;
        }

        if (pre_item_have_flag) {
            pre_item_have_flag = false;
            continue;
        }

        const time = calculate_time(pre_item, format_datas[i]);
        if (i === (format_datas.length - 1) && i !== 0) {
            cur_time = time;
        }

        if (map.has(format_datas[i].data_type)) {
            map.set(format_datas[i].data_type, map.get(format_datas[i].data_type) + time);
        } else {
            map.set(format_datas[i].data_type, time);
        }

        pre_item = format_datas[i];
    }

    const experience_percent = calculate_percent(mac_address, map);

    const obj = {
        experience_time: map.get(DATA_TYPE_EXPERIENCE) || 0,
        free_time: map.get(DATA_TYPE_FREE) || 0,
        experience_percent: experience_percent,
        down_count,
        cur_time,
        format_datas,
        data_source,
        is_first_data
    };

    log('calculate_index_for_mac_address', `mac_address = ${mac_address} ,obj = ${JSON.stringify(obj)}`);
    return obj;
}


async function calculate_index_for_mac_address_crontab(mac_address) {
    const data_source = await client.lrangeAsync(mac_address, '0', '-1');
    log('calculate_index_for_mac_address_crontab', `mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);

    const datas = data_source.map(data => {
        try {
            return JSON.parse(data);
        } catch (e) {
            log('calculate_index_for_mac_address_crontab', `mac_address = ${mac_address} ,JSON.parse error, data =  ${JSON.stringify(data)} ,type = ${typeof data}`);
        }
    });

    const first_data = datas.shift();

    const format_datas = datas.map(data => {
        return data[DATA_KEY];
    });

    let pre_item = get_pre_item(first_data);
    let pre_item_have_flag = false;
    let is_first_data = 0;
    if (pre_item === null) {
        format_datas.unshift(first_data[DATA_KEY]);
        pre_item = first_data[DATA_KEY];
        pre_item_have_flag = true;
        if(format_datas.length === 1){
            //第一次拿起
            is_first_data = 1;
        }else if(format_datas.length === 2){
            //第一次放下(已经有对应上一次拿起了)
            is_first_data = 2;
        }else{
            is_first_data = 0;
        }
    }

    format_datas.sort((a, b) => {
        return a.timestamp > b.timestamp ? 1 : -1;
    });

    const map = new Map();
    let cur_time = CUR_TIME_DEFAULT;
    let down_count = 0;

    log('calculate_index_for_mac_address_crontab', `mac_address = ${mac_address} ,format_datas = ${JSON.stringify(format_datas)}`);
    for (let i = 0; i < format_datas.length; i++) {
        if (format_datas[i].data_type === DATA_TYPE_EXPERIENCE) {
            down_count++;
        }

        if (pre_item_have_flag) {
            pre_item_have_flag = false;
            continue;
        }

        const time = calculate_time(pre_item, format_datas[i]);
        if (i === (format_datas.length - 1) && i !== 0) {
            cur_time = time;
        }

        if (map.has(format_datas[i].data_type)) {
            map.set(format_datas[i].data_type, map.get(format_datas[i].data_type) + time);
        } else {
            map.set(format_datas[i].data_type, time);
        }

        if(format_datas[i].data_type === DATA_TYPE_EXPERIENCE && (i === format_datas.length - 1)){
            const cur_free_time = new Date().getTime() - format_datas[i].timestamp;
            map.set(DATA_TYPE_FREE, map.get(format_datas[i].data_type) + cur_free_time);
        }

        pre_item = format_datas[i];
    }

    const experience_percent = calculate_percent(mac_address, map);

    const obj = {
        experience_time: map.get(DATA_TYPE_EXPERIENCE) || 0,
        free_time: map.get(DATA_TYPE_FREE) || 0,
        experience_percent: experience_percent,
        down_count,
        cur_time,
        format_datas,
        data_source,
        is_first_data
    };

    log('calculate_index_for_mac_address_crontab', `mac_address = ${mac_address} ,obj = ${JSON.stringify(obj)}`);
    return obj;
}

async function cal_insert_logic(mac_address) {
    const { experience_time, free_time, experience_percent, down_count, cur_time, format_datas,data_source,is_first_data } = await calculate_index_for_mac_address(mac_address);
    let shop_id = -1;
    if (format_datas && format_datas[0]) {
        shop_id = format_datas[0].shop_id;
    }

    const is_first_data_result = await handle_is_first_data(mac_address,is_first_data,format_datas,data_source);
    if(is_first_data_result){
        //已经处理完成,直接返回即可
        return;
    }

    let experience_free_time_min = ExperienceIntrevalUtil.get_experience_interval(shop_id);

    if (cur_time < experience_free_time_min && cur_time !== CUR_TIME_DEFAULT) {
        log('cal_insert_logic', `give_up cur_time < ${experience_free_time_min} ,shop_id = ${shop_id} ,mac_address = ${mac_address} ,cur_time = ${cur_time}`);
        await give_up(mac_address, data_source);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    if (experience_time > EXPERIENCE_TIME_MAX) {
        log('cal_insert_logic', `give_up mexperience_time > EXPERIENCE_TIME_MAX ,shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_time = ${experience_time}`);
        await give_up(mac_address, data_source);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    if (experience_percent >= 1 && experience_percent !== INFINITE && down_count >= 3) {
        log('cal_insert_logic', `give_up experience_percent >= 1 && experience_percent !== INFINITE && down_count >= 3 ,shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,down_count = ${down_count}`);
        await give_up(mac_address, data_source);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    if ((experience_percent >= 1 || experience_percent === INFINITE) && down_count < 3) {
        log('cal_insert_logic', `shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,down_count = ${down_count}`);
        reset_time(mac_address);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    let is_strict_flag = await is_strict(mac_address);
    if (is_strict_flag) {
        //严格模式下
        if (experience_percent < 0.1 && free_time >= FREE_TIME_MIN && down_count >= 3) {
            log('cal_insert_logic', `strict retain shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,free_time = ${free_time},down_count = ${down_count}`);
            await retain(mac_address, format_datas,data_source);
            await RedisLock.unlock(client, get_redis_key_lock(mac_address));
            return;
        } else {
            log('cal_insert_logic', `strict wait shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,free_time = ${free_time},down_count = ${down_count}`);
            reset_time(mac_address);
            await RedisLock.unlock(client, get_redis_key_lock(mac_address));
            return;
        }
    } else {
        if (experience_percent < 1 && free_time >= FREE_TIME_MIN && down_count >= 3) {
            log('cal_insert_logic', `retain shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,free_time = ${free_time},down_count = ${down_count}`);
            await retain(mac_address, format_datas,data_source);
            await RedisLock.unlock(client, get_redis_key_lock(mac_address));
            return;
        } else {
            log('cal_insert_logic', `wait shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} ,free_time = ${free_time},down_count = ${down_count}`);
            reset_time(mac_address);
            await RedisLock.unlock(client, get_redis_key_lock(mac_address));
            return;
        }
    }
}

async function crontab_task(mac_address) {
    await RedisLock.get_lock(client, get_redis_key_lock(mac_address), REDIS_KEY_EXPIRE_TIME);
    const { experience_percent, format_datas,data_source } = await calculate_index_for_mac_address_crontab(mac_address);
    let shop_id = -1;
    if (format_datas && format_datas[0]) {
        shop_id = format_datas[0].shop_id;
    }

    if (experience_percent === INFINITE || experience_percent === 0) {
        log('crontab_task', `reset_time shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} `);
        reset_time(mac_address);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    if (experience_percent >= 1) {
        log('crontab_task', `give_up shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} `);
        await give_up(mac_address, data_source);
        await RedisLock.unlock(client, get_redis_key_lock(mac_address));
        return;
    }

    log('crontab_task', `retain shop_id = ${shop_id} ,mac_address = ${mac_address} ,experience_percent = ${experience_percent} `);
    await retain(mac_address, format_datas,data_source);
    await RedisLock.unlock(client, get_redis_key_lock(mac_address));
}

async function save_last_data(mac_address, data) {
    try{
        data = JSON.parse(data);
    }catch (e){}

    log('save_last_data', `mac_address = ${mac_address}, data = ${JSON.stringify(data)}`);
    if(data.data){
        data = data.data;
    }
    await client.lpushAsync(mac_address, JSON.stringify({
        [DATA_KEY]: data,
        [IS_LAST_FLAG_KEY]: IS_LAST_FLAG_VALUE
    }));
}

async function remove_datas(mac_address, data_source) {
    log('remove_datas', `mac_address = ${mac_address} ,data_source = ${JSON.stringify(data_source)}`);
    for (let i = 0; i < data_source.length; i++) {
        await client.lsetAsync(mac_address, i, REDIS_DELETE_FLAG);
    }
    await client.lremAsync(mac_address, 0, REDIS_DELETE_FLAG);
}

function get_pre_item(first_data) {
    if (first_data[IS_LAST_FLAG_KEY] === IS_LAST_FLAG_VALUE) {
        return first_data[DATA_KEY];
    } else {
        return null;
    }
}

function calculate_time(pre_item, cur_item) {
    if (pre_item.data_type !== cur_item.data_type) {
        return cur_item.timestamp - pre_item.timestamp;
    } else {
        return 0;
    }
}

function calculate_percent(mac_address, map) {
    const free_total_time = map.get(DATA_TYPE_FREE) || 0;
    const experience_total_time = map.get(DATA_TYPE_EXPERIENCE) || 0;
    let experience_percent = 0;

    if (free_total_time === 0 && experience_total_time === 0) {
        experience_percent = 0;
    } else if (free_total_time === 0) {
        experience_percent = INFINITE;
    } else if (experience_total_time === 0) {
        experience_percent = 0;
    } else {
        experience_percent = parseFloat((experience_total_time / free_total_time));
    }

    return experience_percent;
}

async function handle_is_first_data(mac_address,is_first_data,format_datas,data_source) {
    log(`hanlde_is_first_data`, `mac_address = ${mac_address} ,is_first_data = ${is_first_data} ,format_datas = ${JSON.stringify(format_datas)} ,data_source = ${JSON.stringify(data_source)}`);
    //第一次拿起,什么都不做

    if(is_first_data === 1){
        return true;
    }

    //第一次放下,直接入retain,触发定时任务
    if(is_first_data === 2){
        await retain(mac_address,format_datas,data_source);
        return true;
    }

    //正常情况
    return false;
}

async function clean_data(mac_address, datas) {
    await remove_datas(mac_address, datas);
    await save_last_data(mac_address, datas[datas.length - 1]);
    reset_time(mac_address);
}

async function give_up(mac_address, datas) {
    await clean_data(mac_address, datas);
}

async function retain(mac_address, datas,data_source) {
    const sensor_report = require('../sensor/sensor_report');
    await sensor_report.hanle_photosensitive_sensor_task(datas);
    await clean_data(mac_address, data_source);
}

function get_redis_key_lock(key) {
    return `${key}_redis_lock_key`
}


function reset_time(mac_address) {
    const key = `${mac_address}_reset_time`;
    log(`reset_time`, `mac_address = ${mac_address}`);
    //TimingTask.reset_task(key,RESET_TIMEING_TASK_INTERVAL,crontab_task,mac_address);
    let content = mac_address
    let message = new Message(process.pid, Constants.MESSAGE.MESSAGE_TYPE_ROUTER_SENSOR_RESET_TASK, 123, content)
    process.send(message);
}

async function get_shop_ids() {
    let query = { "data.status": 1 };
    let result = await model_util.find_docs_form_Data('shop_experience_percent_strategy', query);

    return result.map(item => {
        if (item && item.data) {
            return item.data.shop_id;
        }
    })
}

async function is_strict(mac_address) {
    let query = { 'data.mac_address': mac_address };
    let result = await model_util.find_one_doc_from_Data('shop_experience_percent_strategy_white_list', query);

    return result === null ? false : true;
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
        logger.info(`update sensor token if: ${JSON.stringify(sensor)}`);
        const server_ipad_token_sensor = sensor.data.server_ipad_token;
        if (server_ipad_token_sensor === ''|| server_ipad_token_sensor === undefined || server_ipad_token_sensor === null){
            logger.info(`update sensor token inner if`);
            const rs = await Data('sensor').findOneAndUpdate({'data.mac_address':mac_address,'data.state':2},{$set:{
                'data.server_ipad_token':server_ipad_token
            }}).exec();
            logger.info(`update sensor token: ${mac_address} ${server_ipad_token} ${JSON.stringify(rs)}`);
        }
    }


    return sensor === null ? false:true;
}

module.exports = {
    insert_queue,
    calculate_experience_percent_value,
    get_shop_ids
};