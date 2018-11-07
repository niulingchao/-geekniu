/**
 * Created by wuxueyu on 17/9/14.
 */

const router = require('express').Router({mergeParams:true})

const normalUtil                = require('normalutil');
const numeral                   = require('numeral');
const lodash                    = require('lodash')

const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  Data = ZHMDCollector.getModel().Data

const  global_util = require('../../common/assists')
const  model_util = require('../../common/model_util')
const  Promise    = require('bluebird');
const  Event_report = require("./sensor_event_report")
const Constant      = require("./constant")
const redis = require('redis')
const process = require("process")
const Experience_percent_handle = require('../experience_percent_queue/experience_percent_handle');

const two_mac_address_list = require(process.cwd() + "/middleware/filter/crowd").two_mac_address_list
// const min_time         = require(process.cwd() + "/middleware/filter/crowd").min_time
// const max_time         = require(process.cwd() + "/middleware/filter/crowd").max_time

const inner_optration_time_filter = require(process.cwd() + "/middleware/filter/operation_time_filter" )

const moment  = require("moment")

const Config = ZHMDCollector.getConfig();

let  client = redis.createClient({
    host:Config.baas_config.redis_counter.op_user_count_by_user_host,
    port:Config.baas_config.redis_counter.op_user_count_by_user_port
});



client.on("error", function (err) {
    console.log("Error " + err);
});

const inner_device_warning_display_device_recovery = require('../warning/power_warning').inner_device_warning_display_device_recovery;

router.post('/v10/c/shop/sensor/report.json',async (req,res) =>{

    try {

        await inner_sensor_report(req.body)

        return   global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`SensorReportRouter sensor_report body:${JSON.stringify(req.body)} e:${e.message} `)

        if(lodash.has(e,'error_code')){
            return global_util.errorRequest(req,res,e);
        }
        return global_util.errorRequest(req,res,e.message);
    }
})

router.post("/v10/c/shop/sensor/batch_report.json",async (req,res) =>{

    try{

        let {sensor_items} = req.body;

        if(!Array.isArray(sensor_items)) {

            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'sensor_items')
        }
        await inner_sensor_batch_report(sensor_items)

        return global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`SensorReportRouter bath_sensor_report body:${JSON.stringify(req.body)} e:${e.message} `)

        if(lodash.has(e,'error_code')){
            return global_util.errorRequest(req,res,e);
        }

        return global_util.errorRequest(req,res,e.message);
    }
})

const inner_crowd_filter = async (infrared_sensors) =>{

    try {

        let tasks = [];
        for(let infrared_sensor of infrared_sensors){

            const {mac_address,server_ipad_token,timestamp} = infrared_sensor;

            //判断该mac_address是前置还是后置
            // let is_start = two_mac_address_list.some(data=>{
            //     return data.start === mac_address;
            // });
            // let is_end = two_mac_address_list.some(data=>{
            //     return data.end === mac_address;
            // });

            let crowd_sensor =   await model_util.find_one_doc_from_Data('crowd_sensor_map',{"$or":[{"data.start_mac_address":mac_address},{"data.end_mac_address":mac_address}]})

            if(!crowd_sensor || Object.keys(crowd_sensor).length <=0){

                tasks.push(infrared_sensor)

            }else {

                logger.info(JSON.stringify({key:'log_batch_crowd', params:infrared_sensor}));

                let is_start = true;

                if(crowd_sensor.data.end_mac_address == mac_address){

                    is_start = false;

                }
                if (is_start){//前置传感器触发

                    // 放入redis 中，等待后置传感器命中
                    await  redis_set_value(md5(mac_address + server_ipad_token),JSON.stringify(infrared_sensor))

                    logger.info(`crowd_filter_start:${JSON.stringify(infrared_sensor)}`)

                }else if(!is_start){//后置传感器触发
                    //查找自己的前置传感器
                    // const {start:start_mac} = two_mac_address_list.filter(data=>{
                    //     return data.end === mac_address;
                    // }).pop() || {};

                    const  start_mac = crowd_sensor.data.start_mac_address

                    if (start_mac){

                        let body = await redis_get_value(md5(start_mac + server_ipad_token))
                        await redis_remove_key(md5(start_mac + server_ipad_token))
                        if (body){

                            body = JSON.parse(body)
                            const {timestamp:start_timestamp} = body;
                            const sub_time = timestamp - start_timestamp;
                            logger.info(`crowd_filter_end  sub_time:${sub_time}  end_mac_adress:${JSON.stringify(infrared_sensor)} start_mac_adress:${JSON.stringify(body)}`)

                            // 查询双客流过滤时间间隔

                          let sensor = await Data('sensor').findOne({"data.mac_address":start_mac}).exec()

                            let min_time = 350;
                            let max_time = 3500;

                            if(sensor && Object.keys(sensor).length >0){

                              let bind_show_case = await Data('show_case').findOne({"id":sensor.data.bind_show_case_id}).exec()

                                if(bind_show_case && Object.keys(bind_show_case).length >0){

                                    let  crowd_filter_time =  bind_show_case.data.crowd_filter_time;

                                    let crowd_filter_times =  (crowd_filter_time + "").split(',');


                                    if(crowd_filter_times.length == 2){

                                        try {
                                            min_time = parseInt(crowd_filter_times[0])

                                            max_time = parseInt(crowd_filter_times[1])

                                        }catch (e){

                                            min_time = 350;
                                            max_time = 3500;
                                        }
                                    }

                                    logger.info(`crowd_filter bind_show_case${JSON.stringify(bind_show_case)}`)

                                }

                          }


                            if (sub_time >= min_time && sub_time < max_time){//间隔在合理区间内

                                logger.info(`crowd_filter  pass  sub_time:${sub_time} min_time:${min_time} max_time:${max_time} infrared_sensor:${JSON.stringify(infrared_sensor)}`)
                                tasks.push(body)
                            }else {

                                logger.info(`crowd_filter filter sub_time:${sub_time}  min_time:${min_time} max_time:${max_time} infrared_sensor:${JSON.stringify(infrared_sensor)}`)

                            }
                        }
                    }
                    // 更新心跳
                    Data('crowd_sensor_map').update({"data.end_mac_address":mac_address},{"$set":{"data.heartbeat_time":new Date().getTime()}}).exec()

                }
            }

        }
        return tasks

    }catch (e){

        logger.error(`inner_crowd_filter e:${e.message}`)

        throw e;

    }

}

const handle_infrared_sensor_task = async (infrared_sensor)=>{

    try {

        logger.debug(`handle_infrared_sensor_task task :${JSON.stringify(infrared_sensor)}`)

        let tasks = await inner_crowd_filter(infrared_sensor)

        logger.debug(`handle_infrared_sensor_task  inner_crowd_filter task:${JSON.stringify(tasks)}`)

        await Promise.map(tasks,async (sensor)=>{

            await inner_sensor_report(sensor)
        })

    }catch (e){

        if(lodash.has(e,'error_code')){

            logger.error(`handle_infrared_sensor_task e:${JSON.stringify(e)}`)
            throw e;
        }else {

            logger.error(`handle_infrared_sensor_task e:${e.message}`)
            throw e;
        }
    }

}


const filter_photosensitive_sensor_durtion = async(photosensitive_sensor) =>{


    try {

        let {mac_address, server_ipad_token, timestamp} = photosensitive_sensor;

        const key = global_util.md5(`${mac_address}${server_ipad_token}duration`)
        const freeze_key = global_util.md5(`${mac_address}${server_ipad_token}freeze`)

        let freeze_timestamp = await redis_get_value(freeze_key); // 获取是否是冻结传感器

        if(global_util.isNumber(freeze_timestamp)){

            freeze_timestamp = parseFloat(freeze_timestamp);

            const five_minute_millisecond = 5 * 60 * 1000

            if(freeze_timestamp + five_minute_millisecond >= timestamp){ // 如果上报的时间 在冻结的时间范围内 过滤 否则删除

                logger.info(`filter_photosensitive_sensor_durtion | key = freeze_filter | md5_key:${freeze_key}|freeze_timestamp:${freeze_timestamp} | photosensitive_sensor:${JSON.stringify(photosensitive_sensor)}`)
                return false;

            }else {

                logger.info(`filter_photosensitive_sensor_durtion | key = freeze_remove |md5_key:${freeze_key}|freeze_timestamp:${freeze_timestamp} | photosensitive_sensor:${JSON.stringify(photosensitive_sensor)}`)

                await redis_remove_key(freeze_key)
            }
        }

        let last_sensor_time =  await redis_get_value(key)

        await redis_set_value(key,timestamp)

        if(global_util.isNumber(last_sensor_time)){

            last_sensor_time = parseFloat(last_sensor_time)

            let duration = timestamp - last_sensor_time

            logger.info(`filter_photosensitive_sensor_durtion duration:${duration}| timestamp:${timestamp} | last_sensor_time:${last_sensor_time} | photosensitive_sensor:${JSON.stringify(photosensitive_sensor)}`)

            logger.debug(`filter_photosensitive_sensor_durtion | md5_key:${key}`)


            if(duration > 1500){

                return true;

            }else {

                if(duration <= 900){ // 如果体验时长小于 900m 冻结该传感器

                    logger.info(`filter_photosensitive_sensor_durtion | key = freeze_set_value | md5_key:${freeze_key} |duration:${duration} | photosensitive_sensor:${JSON.stringify(photosensitive_sensor)}`)

                    await redis_set_value(freeze_key,timestamp)
                }

                return false;
            }
        }else {

            logger.info(`filter_photosensitive_sensor_durtion  timestamp:${timestamp}  | last_sensor_time:${last_sensor_time}  photosensitive_sensor:${JSON.stringify(photosensitive_sensor)}`)

            return true;
        }


    }catch (e){

        logger.error(`filter_photosensitive_sensor_durtion e:${e.message}`)

        throw e;

    }

}




const hanle_photosensitive_sensor_task = async (photosensitive_sensor)=>{

    try {

        let tasks = [];

        for(let i = 0; i < photosensitive_sensor.length; i ++) {

            let {mac_address, server_ipad_token, data_type, timestamp} = photosensitive_sensor[i];

            if(!timestamp){
                timestamp = new Date().getTime();
                photosensitive_sensor[i]["timestamp"] = timestamp;
            }


            if (data_type == Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_PICK_UP) {

                await redis_set_value(global_util.md5(`${mac_address}${server_ipad_token}`), JSON.stringify(photosensitive_sensor[i]))

                logger.debug(`hanle_photosensitive_sensor_task sensor pickup into reids body:${JSON.stringify(photosensitive_sensor[i])}`)

            } else {

                let pickup_value = await redis_get_value(global_util.md5(`${mac_address}${server_ipad_token}`));

                logger.debug(`hanle_photosensitive_sensor_task sensor get from reids value:${pickup_value} body:${JSON.stringify(photosensitive_sensor[i])}`)

                if (pickup_value) {

                    await redis_remove_key(global_util.md5(`${mac_address}${server_ipad_token}`))

                       pickup_value = JSON.parse(pickup_value)

                        const durtion = timestamp - pickup_value.timestamp;

                       if(durtion < 3600 * 1000 * 24){

                           if (durtion > 2000 && durtion < 780000) {
                               photosensitive_sensor[i] = lodash.merge(photosensitive_sensor[i],{"experience_duration":durtion})
                               tasks.push(pickup_value);
                               tasks.push(photosensitive_sensor[i])
                               logger.debug(`hanle_photosensitive_sensor_task sensor durtion > 2s durtion:${durtion} pick_up:${JSON.stringify(pickup_value)} down_up:${JSON.stringify(photosensitive_sensor[i])}`)

                           }else {

                               logger.info(`hanle_photosensitive_sensor_task sensor durtion <= 2s durtion:${durtion} pick_up:${JSON.stringify(pickup_value)} down_up:${JSON.stringify(photosensitive_sensor[i])}`)
                           }

                       }else {

                           logger.info(`hanle_photosensitive_sensor_task durtion > a day  info:${JSON.stringify(photosensitive_sensor[i])}`)

                       }

                }else {

                    logger.info(`hanle_photosensitive_sensor_task  down_up can not find pickup  down_up:${JSON.stringify(photosensitive_sensor[i])}`)
                    // 没有 找到上一次的拿起 过滤
                    // tasks.push(lodash.merge(photosensitive_sensor[i],{"experience_duration":0}))
                }
            }

        }

        logger.info(`hanle_photosensitive_sensor_task task:${JSON.stringify(tasks)}`)
        await Promise.map(tasks,async (task)=>{

            await inner_sensor_report(task)
        })

    }catch (e){

        if(lodash.has(e,'error_code')){

            logger.error(`hanle_photosensitive_sensor_task e:${JSON.stringify(e)}`)
            throw e;
        }else {

            logger.error(`hanle_photosensitive_sensor_task e:${e.message}`)
            throw e;
        }

    }

}


const redis_get_value= (key)=>{

    return new Promise((resolved,reject)=>{

        client.get(key, function (err,response) {
            if(err) {
                reject(err);
            }else {
                resolved(response);
            }
        });
    });
};

const redis_set_value = (key,value) =>{

    return new Promise((resolved,reject)=>{

        client.set(key,value,function (err,response) {
            if(err) {
                reject(err);
            }else {
                resolved(response);
            }
        });
    });


}


const redis_remove_key = (key) =>{

    return new Promise((resolved,reject)=>{

        client.DEL(key,function (err,response) {
            if(err) {
                reject(err);
            }else {
                resolved(response);
            }
        });
    });


}


const inner_sensor_batch_report = async (items) =>{

    try {

        let photosensitive_sensor = []; // 光敏传感器

        let infrared_sensor = [];// 红外传感器

        logger.debug(`inner_sensor_batch_report items:${JSON.stringify(items)}`)

        items = await Promise.filter(items,async(item) =>{

            return !await inner_optration_time_filter.inner_optration_time_filter(item)

        })

        logger.debug(`inner_sensor_batch_report  inner_optration_time_filter items:${JSON.stringify(items)}`)

        items.map((item) =>{
            if([Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_PICK_UP,Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_DOWN].indexOf(item.data_type) >=0 ){
                photosensitive_sensor.push(item)
            }else if(item.data_type == Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_INFRARED){

                infrared_sensor.push(item);
            }
        })

        await handle_infrared_sensor_task(infrared_sensor);
        await Experience_percent_handle.insert_queue(photosensitive_sensor);
        // await  Promise.all([handle_infrared_sensor_task(infrared_sensor),hanle_photosensitive_sensor_task(photosensitive_sensor)])

    }catch (e) {

        logger.error(`inner_sensor_batch_report e:${e.message}`);
        throw e;

    }
}



const inner_sensor_report = async (body) => {

    try{

        let  {mac_address, server_ipad_token, signal, shop_id, data_type, uid, timestamp,experience_duration} = body;

        if(global_util.isNumber(shop_id)) {

            shop_id = parseInt(shop_id)
        }

        if(global_util.isNumber(data_type)){

            data_type = parseInt(data_type)
        }

        let check_result = check_param(mac_address, server_ipad_token, signal, shop_id, data_type, uid,timestamp)


        if(global_util.isNumber(timestamp)) timestamp = parseFloat(timestamp)

        timestamp = timestamp|| new Date().getTime();

        if(check_result){

            throw  check_result;
        }

        // 查询sensor 并处理sensor 的ipad_server_token

        let sensor = await handle_sensor_server_ipad_token(mac_address,server_ipad_token);

        if(sensor){

            let tasks = [handle_sensor_signal_task(sensor,signal),handle_display_device_heartime_task(server_ipad_token),handle_display_device_recovery(body)]

            await Promise.all(tasks)
            // 数据分析 异步进行处理
            Event_report.sensor_event_report(sensor,shop_id,data_type,uid,timestamp,experience_duration)
        }else {

            logger.info(`inner_sensor_report sensor can not find mac_address:${mac_address} server_ipad_token:${server_ipad_token}`)
        }

        return true

    }catch (e){

        if(lodash.has(e,'error_code')){

            logger.error(`inner_sensor_report e:${JSON.stringify(e)}`)
            throw e;
        }else {

            logger.error(`inner_sensor_report e:${e.message}`)
            throw e;
        }

    }


// 处理传感器 ipad_server_ipad_token
    async function  handle_sensor_server_ipad_token(mac_address,server_ipad_token) {

        const query_conditions = {"$and":
            [
                {"data.mac_address":mac_address},
                {"data.state":2},
                {"$or":
                    [
                        {"data.server_ipad_token":server_ipad_token},
                        {"data.server_ipad_token":""},// token 为空
                        {"data.server_ipad_token":{"$exists":false}} // server_ipad_token 不存在

                    ]
                }
            ]}

        let sensor = await model_util.find_one_doc_from_Data('sensor',query_conditions);

        if(sensor  && Object.keys(sensor).length > 0){ // sensor 符合入库条件

            if(!sensor.data.server_ipad_token || sensor.data.server_ipad_token === ''){

                // 更新sensor 的 server_ipad_token
                const conditions = {
                    "data.mac_address":mac_address
                }
                const doc = {
                    "data.server_ipad_token":server_ipad_token
                }
                await model_util.update_Data('sensor',conditions,doc);
            }
        }

        return sensor;

    }
}


const inner_sensor_report_for_experience_percent_queue = async (body) => {

    try{

        let  {mac_address, server_ipad_token, signal, shop_id, data_type, uid, timestamp} = body;

        if(global_util.isNumber(shop_id)) {

            shop_id = parseInt(shop_id)
        }

        if(global_util.isNumber(data_type)){

            data_type = parseInt(data_type)
        }

        let check_result = check_param(mac_address, server_ipad_token, signal, shop_id, data_type, uid,timestamp)


        if(global_util.isNumber(timestamp)) timestamp = parseFloat(timestamp)

        timestamp = timestamp|| new Date().getTime();

        if(check_result){

            throw  check_result;
        }

        // 查询sensor 并处理sensor 的ipad_server_token

        let sensor = await handle_sensor_server_ipad_token(mac_address,server_ipad_token);

        if(sensor){

            let tasks = [handle_sensor_signal_task(sensor,signal),handle_display_device_heartime_task(server_ipad_token),handle_display_device_recovery(body)]

            await Promise.all(tasks)
            // 数据分析 异步进行处理
            Event_report.sensor_event_report(sensor,shop_id,data_type,uid,timestamp,'no_experience_duration')
        }else {

            logger.info(`inner_sensor_report_for_experience_percent_queue sensor can not find mac_address:${mac_address} server_ipad_token:${server_ipad_token}`)
        }

        return true

    }catch (e){

        if(lodash.has(e,'error_code')){

            logger.error(`inner_sensor_report_for_experience_percent_queue e:${JSON.stringify(e)}`)
            throw e;
        }else {

            logger.error(`inner_sensor_report_for_experience_percent_queue e:${e.message}`)
            throw e;
        }

    }


// 处理传感器 ipad_server_ipad_token
    async function  handle_sensor_server_ipad_token(mac_address,server_ipad_token) {

        const query_conditions = {"$and":
            [
                {"data.mac_address":mac_address},
                {"data.state":2},
                {"$or":
                    [
                        {"data.server_ipad_token":server_ipad_token},
                        {"data.server_ipad_token":""},// token 为空
                        {"data.server_ipad_token":{"$exists":false}} // server_ipad_token 不存在

                    ]
                }
            ]}

        let sensor = await model_util.find_one_doc_from_Data('sensor',query_conditions);

        if(sensor  && Object.keys(sensor).length > 0){ // sensor 符合入库条件

            if(!sensor.data.server_ipad_token || sensor.data.server_ipad_token === ''){

                // 更新sensor 的 server_ipad_token
                const conditions = {
                    "data.mac_address":mac_address
                }
                const doc = {
                    "data.server_ipad_token":server_ipad_token
                }
                await model_util.update_Data('sensor',conditions,doc);
            }
        }

        return sensor;

    }
}


// 处理sensor 的信号量
async function handle_sensor_signal_task(sensor,signal) {


    try {

        const  before_signal = normalUtil.parseIntDefault(sensor.data.signal);

        //判断当前sensor绑定的ipad上报，信号是不是低于本次汇报信号强度 - 10，或者当前记录的信号强度低于-80，则解除绑定

        let  update_data = {"data.signal":signal,"data.heartbeat_time":new Date().getTime()}

        if(before_signal < (signal - 10) || signal <= -80 || signal === 127){

            update_data["data.server_ipad_token"] = "";
        }
        await model_util.update_Data('sensor',{"id":sensor.id},update_data)

    }catch (e){

        logger.error(`handle_sensor_signal_task ${e.message}`);

        throw e

    }



}

//处理 display_device 的心跳时间
async function handle_display_device_heartime_task(server_ipad_token) {


    try {
        await model_util.update_Data('display_device',{"data.ios_token":server_ipad_token},{"data.heartbeat_time":new Date().getTime()})


    }catch (e){
        logger.error(`handle_display_device_heartime_task ${e.message}`);

        throw e


    }


}
//处理 蓝牙主机之前离线，发送短信

async function handle_display_device_recovery(body) {

    try {

        await inner_device_warning_display_device_recovery(body)


    }catch (e){

        logger.error(`inner_device_warning_display_device_recovery ${e.message}`);

        throw e

    }


}



// 参数检查
function check_param(mac_address, server_ipad_token, signal, shop_id, data_type, uid,timestamp) {
    let check_result = null;

    if(!mac_address){

        check_result = Code.MISS_PARAMS
        check_result.error_msg = check_result.error_msg.replace("%s",'mac_address');
        return check_result;
    }
    if(!server_ipad_token){

        check_result = Code.MISS_PARAMS
        check_result.error_msg = check_result.error_msg.replace("%s",'server_ipad_token');
        return check_result;
    }

    if(!signal){

        check_result = Code.MISS_PARAMS
        check_result.error_msg = check_result.error_msg.replace("%s",'signal');
        return check_result;
    }

    if(!shop_id){

        check_result = Code.MISS_PARAMS
        check_result.error_msg = check_result.error_msg.replace("%s",'shop_id');
        return check_result;
    }


    if(!data_type){

        check_result = Code.MISS_PARAMS;

        check_result.error_msg = check_result.error_msg.replace("%s","data_type");
    }

    if([1,2,3].indexOf(data_type) == -1){ // data_type 参数无效

        check_result = Code.PARAM_ERROR;

        check_result.error_msg = check_result.error_msg.replace("%s","data_type");
    }

    if(!uid){

        check_result = Code.MISS_PARAMS;
        check_result.error_msg = check_result.error_msg.replace("%s","uid");
    }

    if(isNotNumber(uid)){
        check_result = Code.MISS_PARAMS;
        check_result.error_msg = check_result.error_msg.replace('%s','uid');
        return check_result;
    }

    return check_result;
}

module.exports ={

    router,
    inner_sensor_batch_report,
    hanle_photosensitive_sensor_task,
    inner_sensor_report_for_experience_percent_queue
}


