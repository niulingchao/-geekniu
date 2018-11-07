/**
 * Created by wuxueyu on 17/8/14.
 */
const router = require('express').Router({mergeParams:true})
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  Data = ZHMDCollector.getModel().Data
const  User = ZHMDCollector.getModel().User;
const  Keygen  = ZHMDCollector.getModel().Keygen;
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  model_util   = require('../../common/model_util')
const  global_util = require('../../common/assists')
const Config = ZHMDCollector.getConfig();
const lodash = require('lodash')
const path = require("path")
const moment = require("moment")
const process = require("process")
const Util_Send_Sms = require(process.cwd() + "/lib/sendSmsMethods.js")
const Promise       = require('bluebird');


const fs = require("fs")

const white_phones = require("./white_phone_list.json")


router.post('/zhmd/device_warning/report_power.json',async (req,res,next) =>{

    try{

        let {uid,shop_id,token,warning_from,warning_value} = req.body;

        if(!shop_id){

            return   global_util.errorRequest(req,res,Code.MISS_PARAMS,'shop_id')
        }

        if(!token){

            return  global_util.errorRequest(req,res,Code.MISS_PARAMS,'token');
        }


        if(!uid){

            return  global_util.errorRequest(req,res,Code.MISS_PARAMS,'uid')

        }

        const warning_from_default = [0,1];

        if(warning_from_default.indexOf(warning_from) == -1){

            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'warning_from')
        }

        if(!warning_value){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'warning_value');
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'uid')
        }


        // 电量 大于 30% 属于误报
        if(global_util.parseIntThrowError(warning_value) > 30){

            return  global_util.errorRequest(req,res,Code.PARAM_ERROR,'warning_value')
        }

        if(!is_current_time_in_warning_during()){

            return global_util.jsonResponse(res,false,req)

        }

        let shop = await model_util.find_one_doc_from_Data('shop',{"id":shop_id})


        let device = await model_util.find_one_doc_from_Data('display_device',{"data.shop_id":shop_id,"data.ios_token":token})


        if(!device || Object.keys(device).length <=0){

            return global_util.errorRequest(req,res,'device 不存在')
        }

        if(!shop || Object.keys(shop).length <=0){

            return global_util.errorRequest(req,res,'shop 不存在')
        }

        if(device.data.blue_host != 1){ // 没有加入到白名单

            return global_util.jsonResponse(res,true,req)

        }

        await save_device_warning(uid,shop_id,token,warning_from,warning_value,shop)

        let msg_phones =  await get_msg_phones(shop);

        logger.info(`zhmd/device_warning/report_power.jons msg_phones:${msg_phones}`)

        let user = await User.findOne({"$and":[{"user_data.user_group":0},{"user_data.shop_id":shop.id}]})
        // let  warning_msg =  warning_msg_template(shop.data.shop,device.data.name,'电量告警',`低于${warning_value}%`)

        let warning_msg = warning_msg_template_of_power(shop.data.shop,device.data.name,`${warning_value}%`,user.user_data.name)

        let provider = Config.config_manager['sms']['luosimao'];

          await Util_Send_Sms.send_msg_with_luosimao(provider,msg_phones,warning_msg)

         await  save_sms_warning_history(msg_phones,shop,token,warning_msg,0,1)

        return global_util.jsonResponse(res,true,req)

    }catch (e){

        logger.info(`/zhmd/device_warning/report_power.json e:${e.message}`);

        return  global_util.errorRequest(req,res,e.message)

    }
})


router.post('/zhmd/device_warning/display_device/check_hearbeat.json',async (req,res,next) => {

    try {

        if(!is_current_time_in_warning_during()){

            return global_util.jsonResponse(res,true,req);
        }

        let timestamp = new Date().getTime() - 3600 * 1000;

        let display_device_conditions =  {$and:[
            {"data.blue_host":1},
            {"data.state":0},
            {"$or":[{"data.heartbeat_time":{$lt: timestamp}},{"data.open_blue_host":2}]},
            {$or:[{"data.type":0},{"data.type":103}]}]}

        let offline_display_device = await  model_util.find_docs_form_Data('display_device',display_device_conditions)

        Promise.map(offline_display_device,async (device) =>{

            let shop = await model_util.find_one_doc_from_Data('shop', {"id": global_util.parseIntThrowError(device.data.shop_id)})

            if (shop && Object.keys(shop).length > 0) {

                // 查询用户
                //
                let user = await User.findOne({"$and":[{"user_data.user_group":0},{"user_data.shop_id":shop.id}]})

                let msg_phones = await get_msg_phones(shop);

                let names = device.data.name;

                let device_ids = device.data.ios_token

                let manager_name = "";

                if(user){

                    manager_name = user.user_data.name
                }

                let warning_msg;
                if(device.data.heartbeat_time < timestamp ){

                    let hour = calculate_waning_time(device.data.heartbeat_time)
                    warning_msg = warning_msg_template_of_device(shop.data.shop,names,hour,manager_name)

                }else if(device.data.open_blue_host == 2){

                    warning_msg = warning_msg_template_of_blue_host_offline(shop.data.shop,names,manager_name)

                }
                let provider = Config.config_manager['sms']['luosimao'];

                await Util_Send_Sms.send_msg_with_luosimao(provider, msg_phones, warning_msg)

                await  save_sms_warning_history(msg_phones, shop, device_ids, warning_msg, 1,0)
            }
        })

        return global_util.jsonResponse(res,true,req)


    }catch (e){

        logger.error(`/zhmd/device_warning/display_device/check_hearbeat.json e:${e.message}`)

        return  global_util.errorRequest(req,res,e.message)
    }

})


router.post('/zhmd/device_warning/display_device/recovery.json',async (req,res,next)=>{

    try {

        const {display_device_id,server_ipad_token} = req.body;

        if(!display_device_id && !server_ipad_token){

            global_util.errorRequest(req,res,Code.MISS_PARAMS,'display_device_id');
        }

        await inner_device_warning_display_device_recovery(req.body)

       return global_util.jsonResponse(res,true,req)

    }catch (e){

        logger.error(`/zhmd/device_warning/report_power.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);

    }

})

async function inner_device_warning_display_device_recovery(body) {


    try {

        const {display_device_id,server_ipad_token} = body;

        let  find_display_device_query;

        if(display_device_id){

            find_display_device_query = {"id":display_device_id}

        }else {

            find_display_device_query = {"data.ios_token":server_ipad_token}
        }

        let display_device =  await model_util.find_one_doc_from_Data('display_device',find_display_device_query);

        logger.debug(`/zhmd/device_warning/report_power.json find display_device ${JSON.stringify(display_device)}`)

        if(!display_device){
            return true
        }

        let sms_history_query = {"data.device_id":display_device.data.ios_token,"data.shop_id":display_device.data.shop_id,"data.type":1}

        logger.debug(`/zhmd/device_warning/report_power.json find sms history query${JSON.stringify(sms_history_query)}`)

        // let sms_history =  await Data('sms_warning_history').find(sms_history_query).sort({"created_at":-1}).limit(1).exec()

        let sms_history =  await Data('sms_warning_history').findOneAndUpdate(sms_history_query,{"data.state":1},{"sort":{"created_at":-1}}).exec()

        logger.debug(`/zhmd/device_warning/report_power.json find sms_history ${JSON.stringify(sms_history)}`)

        if(sms_history && sms_history.data.state == 1){

            return true;

        }else  if(sms_history &&  sms_history.data.state == 0){ // 发送短信

            let recovery_time = moment().format('MM月DD日 H:mm:ss')

            let warning_msg =  warning_recovery_warning_msg_template(sms_history.data.shop_name,display_device.data.name,recovery_time)

            let shop = await model_util.find_one_doc_from_Data('shop',{"id":sms_history.data.shop_id})

            let msg_phones = sms_history.data.warning_to;

            // 异步处理就好
//            Data('sms_warning_history').update({"id":sms_history.id},{$set:{"data.state":1}}).exec()

            let provider = Config.config_manager['sms']['luosimao'];

            await Util_Send_Sms.send_msg_with_luosimao(provider, msg_phones, warning_msg)

            save_sms_warning_history(msg_phones, shop,sms_history.data.device_id,warning_msg,101,1)
        }

    }catch (e){

       throw e;

    }
}

function warning_recovery_warning_msg_template(shop_name,device_name,time) {


    let warning_msg = `${shop_name}蓝牙主机恢复正常! \n门店名称：${shop_name} \n蓝牙主机名称：${device_name}\n 数据恢复时间:${time}`

    return warning_msg;

}



function warning_msg_template_of_device(shop_name,device_name,warning_time,manage_name) {


    let warning_msg = `${shop_name}智慧门店APP检测到手机${device_name}断网,已持续${warning_time}小时，请${manage_name || ''}尽快处理`
    return warning_msg;

}


function warning_msg_template_of_blue_host_offline(shop_name,device_name,manage_name) {


    let warning_msg = `${shop_name}智慧门店APP检测到手机${device_name}蓝牙离线，请${manage_name || ''}尽快处理`
    return warning_msg;
}


function warning_msg_template_of_power(shop_name,device_name,warning_time,manage_name) {


    let warning_msg = `${shop_name}智慧门店APP检测到手机${device_name}电量告警，低于${warning_time}，请${manage_name || ''}尽快处理`

    return warning_msg;

}

async function get_msg_phones(shop) {

    // let user_conditons = {"$or":[
    //     {"$and":[{"user_data.user_group":0},{"user_data.shop_id":shop.id}]},
    //
    //     {"$and":[{"user_data.user_group":1},{"user_data.shop_id":shop.data.region_id}]},
    //
    //     {"$and":[{"user_data.user_group":2},{"user_data.shop_id":shop.data.head_office_id},{"$or":[{"user_data.is_warning":{"$exists":false}},{"user_data.is_warning":1}]}]}
    // ]
    // }


    let user_conditons = {"$or":[

        {"$and":[{"user_data.user_group":0},{"user_data.shop_id":shop.id}]},

        {"$and":[{"user_data.user_group":1},{"user_data.shop_id":shop.data.region_id}]},
     ]
    }

    let shop_phones =  await User.distinct("private_data.phone",user_conditons)

    const white_list_query = {"data.shop_ids":{$elemMatch:{"$eq":shop.id}},"data.state":0}

    let white_list = await Data('warning_list').distinct("data.phone",white_list_query)

    if(Array.isArray(white_list)){

        shop_phones = shop_phones.concat(white_list)
    }

    logger.info(`device_warning white_list:${white_list}`)

    const black_list_query = {"data.shop_ids":{$elemMatch:{"$eq":shop.id}},"data.state":1}

     let  black_list =  await Data('warning_list').distinct("data.phone",black_list_query)

    logger.info(`device_warning black_list:${black_list}`)

    shop_phones =  shop_phones.filter((phone) =>{

      return  ! black_list.some( (black_phone)=> {
          return (phone + "") === (black_phone + "")
        })

    })

    logger.info(`device_warning black_list_filter:${shop_phones}`)

    shop_phones  =  shop_phones.filter((phone) =>{

        return   /^1[3|4|5|8][0-9]\d{4,8}$/.test(phone)
    })

    let set = new Set(shop_phones);

    shop_phones = Array.from(set)

    logger.info(`device_warning get_msg_phones ${shop_phones}`)

    return shop_phones.join(',');
}

function is_current_time_in_warning_during() {

    const current_hour = moment().hour();

    // 晚上8点后到早9点之前这段时间不在短信告警范围内
    if((current_hour >= 0 && current_hour <= 8) || ( new Date().getTime() >= moment({ hour:20, minute:5 }).unix() * 1000 && current_hour <24) ){

        return false;

    }

    return true;

}






async function save_sms_warning_history(msg_phones,shop,token,warning_msg,type,state) {

    try {

        const key = await Keygen.issuePromise();

        let  data = new Data('sms_warning_history')();

        data._id     = key;
        data.id      = key;
        data.uid     = 1185378158575618
        data.data    = {

            "type":type,
            "warning_to":msg_phones,
            "shop_id":shop.id,
            "shop_name":shop.data.shop,
            "device_id":token,
            "warning_msg":warning_msg,
            "state":state
        };

        return await data.save();

    }catch (e){

        logger.error(`zhmd/device_warning/report_power.json save_sms_warning_history e:${e.message}`)

        throw e;
    }

}



async  function save_device_warning(uid,shop_id,token,warning_from,warning_value,shop) {

    try {

        const key = await Keygen.issuePromise();

        let  data = new Data('device_warning')();

        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = {
            "shop_id":shop_id,
            "token":token,
            "warning_from":warning_from,
            "power_value":warning_value,
            "shop_name":shop.data.shop,
            "warning_type":0
        };

        return await data.save();

    }catch (e){

        logger.error(`zhmd/device_warning/report_power.json save_device_warning e:${e.message}`)

        throw e;
    }
}


function calculate_waning_time(time) {

    let hear_time = moment(time);

    let now = moment()

    let interval_hour = now.diff(hear_time, 'hours')

    let now_day = now.startOf('day');

    let hear_day = hear_time.startOf('day');

    let interval_day =  now_day.diff(hear_day,'days')

    const warning_start_hour_time = 8; // 报警开始时间

    const warning_end_hour_time = 21; // 报警结束时间

    const no_warning_interval = 11; // 不在报警范围内的时间

    const hours_of_day = 24 // 全天时间

    if( moment(time).hour() >= warning_start_hour_time && moment(time).hour() < warning_end_hour_time) {

        interval_hour -= interval_day * no_warning_interval;

    }else if(moment(time).hour() >= warning_end_hour_time && moment(time).hour() <= hours_of_day){

        interval_hour = interval_hour - ((interval_day - 1) || 0) * no_warning_interval - (hours_of_day + warning_start_hour_time - moment(time).hour())

    }else if(moment(time).hour() >=0  && moment(time).hour() < warning_start_hour_time){

        interval_hour = interval_hour - interval_day * no_warning_interval - (warning_start_hour_time- moment(time).hour())

    }

    if(interval_hour <=0) interval_hour = 1

    return interval_hour;

}


module.exports = {
    "router":router,
    "inner_device_warning_display_device_recovery":inner_device_warning_display_device_recovery
};
