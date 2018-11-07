/**
 * Created by wuxueyu on 17/8/8.
 */
const router = require('express').Router({mergeParams:true})
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  Data = ZHMDCollector.getModel().Data
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  global_util = require('../../common/assists')
const  modle_util  = require('../../common/model_util')
const Promise                   = require('bluebird');
const  lodash   = require('lodash')

router.post('/zhmd/device_manage/sensor/state_list.json',async (req,res,next) => {

    try {

        const {uid, shop_id} = check_sensor_state_param(req, res);

        const user = await modle_util.find_one_user({"id": uid});

        if (!user || Object.keys(user).length <= 0) {

            return global_util.errorRequest(req, res, Code.USER_NOT_EXIST);
        }
        // 客流传感器
        let {total_crowd_count, total_crowd_offline_count, crowds}= await find_crowd_sensor(shop_id);

        logger.info(`total_crowd_count:${total_crowd_count},total_crowd_offline_count:${total_crowd_offline_count}}`)
        // shop下的平面图 的show_case_id

        let {total_plan_count, total_plan_offline_count, plan_infos} = await find_show_case_id_of_plans(shop_id,user.user_data.shop_type)

        logger.info(`total_plan_count:${total_plan_count},total_plan_offline_count:${total_plan_offline_count}}`)

        // 计算离线率

        const offline_rate = Math.round((total_plan_offline_count + total_crowd_offline_count) / (total_crowd_count + total_plan_count) * 100)

        let result = {"crowds_sensor": crowds, "goods_sensor": plan_infos, "offline_rate": offline_rate}

        return global_util.jsonResponse(res, result, req)

    }catch (e) {

        logger.error(`/zhmd/device_manage/sensor/state_list.json e:${e.message} body:${JSON.stringify(req.body)}`)

        return global_util.errorRequest(req, res, e.message);
    }

})



router.post('/zhmd/device_manage/crowd_sensor/detail.json',async(req,res,next) =>{

    try{

        let {door_id} = req.body;

        if(!door_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'door_id');
        }

        let door_show_case = await modle_util.find_one_doc_from_Data('show_case',{"data.use_type":1,"id":door_id})

        if(!door_show_case || Object.keys(door_show_case).length <=0) {

            return global_util.errorRequest(req,res,'不存在此客流门')

        }
        const find_sensor_query = {"data.state":2,"data.bind_show_case_id":door_id}

        let sersors =  await  modle_util.find_docs_form_Data('sensor',find_sensor_query)

        let result = await Promise.map(sersors,async (sensor) =>{

            let result_sensor = {"id":sensor.id,"use_type":sensor.data.use_type,"mac_address":sensor.data.mac_address,"heartbeat_time":sensor.data.heartbeat_time,"online_state": is_sensor_online(sensor.data.heartbeat_time)}

            return result_sensor;
        })

        return  global_util.jsonResponse(res,result,req)


    }catch (e){

        logger.error(`/zhmd/device_manage/crowd_show_case/detail.json e:${e.message} body:${JSON.stringify(req.body)}`)

        return global_util.errorRequest(req,res,e.message)
    }


})


router.post('/zhmd/device_manage/plan_sensor/detail.json',async (req,res,next) =>{

    try {

        let {plan_id,uid} = req.body;

        if(!plan_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'plan_id');
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'uid');
        }



        const user = await modle_util.find_one_user({"id": uid});

        if (!user || Object.keys(user).length <= 0) {

            return global_util.errorRequest(req, res, Code.USER_NOT_EXIST);
        }

        let shop_type = user.user_data.shop_type;

        let show_case_ids = await Data('plan_show_case').distinct('data.show_case_id',{"data.plan_id":plan_id}).exec()

        const sensor_conditions = {"data.state":2};

        if(shop_type === 0){

            sensor_conditions["data.bind_show_case_id"] = {"$in":show_case_ids}

        }else {

            sensor_conditions["data.show_case_id"] = {"$in":show_case_ids};
            sensor_conditions["data.goods_spec_id"] = {"$gt":0}
        }

        let  sensors = await modle_util.find_docs_form_Data('sensor',sensor_conditions)

        let result = await Promise.map(sensors,async (sensor) =>{

            let result_sensor = {"goods_spec_id":sensor.data.goods_spec_id,"bind_show_case_id":sensor.data.bind_show_case_id,"id":sensor.id,"use_type":sensor.data.use_type,"mac_address":sensor.data.mac_address,"heartbeat_time":sensor.data.heartbeat_time,"online_state": is_sensor_online(sensor.data.heartbeat_time)}

            let sensor_id = sensor.data.show_case_id || sensor.data.bind_show_case_id;

            let show_case = await modle_util.find_one_doc_from_Data('show_case',{"id":sensor_id})

            if(show_case && Object.keys(show_case).length >0){

                result_sensor["show_case_name"] = show_case.data.name;
            }

                let goods = await modle_util.find_one_doc_from_Data('goods',{"id":sensor.data.goods_id || 0})

                if(goods && Object.keys(goods).length >0){

                    result_sensor['goods_name'] = goods.data.name;
                }

            return result_sensor;
        })

        return  global_util.jsonResponse(res,result,req)


    }catch (e){

       return global_util.errorRequest(req,res,e.message)

    }



})


router.post('/zhmd/device_manage/plan_show_case_sensor/detail.json',async(req,res,next) =>{

    try {

        let {plan_id} = req.body;

        if(!plan_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'plan_id');
        }

        let plan_show_cases =  await modle_util.find_docs_form_Data('plan_show_case',{'data.plan_id':plan_id})


        let result =  await Promise.filter(plan_show_cases,async plan_show_case =>{

            let show_case_id  = plan_show_case.data.show_case_id || 0;

            return await is_plan_has_offline_sensor(show_case_id)

        })
        let result_include_show_case_name = await Promise.map(result,async item =>{

            let show_case = await modle_util.find_one_doc_from_Data('show_case',{"id":item.data.show_case_id})

            if(show_case && Object.keys(show_case).length >0){

                item['show_case_name'] = show_case.data.name;
            }
            return item;

        })

        return global_util.jsonResponse(res,result_include_show_case_name,req)


    }catch (e){


        return global_util.errorRequest(req,res,e.message)

    }



})

async function is_plan_has_offline_sensor(show_case_id) {


    let find_sensor_query = {"data.bind_show_case_id":show_case_id,"data.state":2}

    let sensors =  await modle_util.find_docs_form_Data('sensor',find_sensor_query);


    for(let sensor of sensors){

        if(!is_sensor_online(sensor.data.heartbeat_time)){

            return true;
        }
    }

    return false;

}



async function find_show_case_id_of_plans(shop_id,shop_type) {


    try {

        let plans =  await  modle_util.find_docs_form_Data('plan',{"data.plan_type":{"$ne":10},"data.shop_id":shop_id})

        let total_plan_count = 0;

        let total_plan_offline_count = 0;


        let plan_infos =  await Promise.map(plans,async plan =>{

            let show_case_ids = await Data('plan_show_case').distinct('data.show_case_id',{"data.plan_id":plan.id}).exec()

            const sensor_conditions = {"data.shop_id":shop_id,"data.state":2};

            if(shop_type === 0){

                sensor_conditions["data.bind_show_case_id"] = {"$in":show_case_ids}

            }else {

                sensor_conditions["data.show_case_id"] = {"$in":show_case_ids};
                sensor_conditions["data.goods_spec_id"] = {"$gt":0}

            }

            let  sensors = await modle_util.find_docs_form_Data('sensor',sensor_conditions)

            let offine_count = check_sersor_state(sensors);

            total_plan_count += sensors.length;
            total_plan_offline_count += offine_count;

            let plan_info = {"plan_image_url":plan.data.image_url,"plan_id":plan.id,"plan_name":plan.data.name,"total_count":sensors.length,"online_count":sensors.length - offine_count,"offline_count":offine_count}

            return plan_info;
        })

        return {total_plan_count,total_plan_offline_count,plan_infos}


    }catch (e) {


        logger.error(` /zhmd/device_manage/sensor/state_list.json  find_show_case_id_of_plans e:${e.message} shop_id:${shop_id}`)

        throw e ;

    }

}

// 检查传感器状态
function check_sersor_state(sensors) {

    let offine_count = 0;

    sensors.map(sensor =>{

        if(!is_sensor_online(sensor.data.heartbeat_time || 0)) offine_count ++
    })

    return offine_count;
}

function is_sensor_online(sensorheat_time) {

    const current_time = new Date().getTime()
    const heartbeat_time = sensorheat_time || 0;
// 999 临时处理 传感器心跳  正常值为 3 个小时
    if(current_time - heartbeat_time > 3600 * 1000 * 999) return false;

    return true

}




// 查询客流传感器
async function find_crowd_sensor(shop_id) {


    try {

        const crowd_show_case_conditons = {"data.use_type":1,"data.shop_id":shop_id}

        let crowd_show_case = await modle_util.find_docs_form_Data('show_case',crowd_show_case_conditons);

        let total_crowd_offline_count = 0;

        let total_crowd_count = 0;

        let crowds = await Promise.map(crowd_show_case,async(show_case) =>{

            const sensor_conditons = {"data.state":2,"data.shop_id":shop_id,"data.bind_show_case_id":show_case.id}

            let sensors = await modle_util.find_docs_form_Data('sensor',sensor_conditons);

            let offline_count = check_sersor_state(sensors)

            total_crowd_offline_count += offline_count;

            total_crowd_count += sensors.length;

            return {"id":show_case.id,"name":show_case.data.name,"total_count":sensors.length,"online_count":sensors.length - offline_count,"offline_count":offline_count}

        })


        return {total_crowd_count,total_crowd_offline_count,crowds}

    }catch (e){


        logger.error(` /zhmd/device_manage/sensor/state_list.json  find_crowd_sensor e:${e.message} shop_id:${shop_id}`)

        throw e ;

    }


}

// 检查请求参数
function check_sensor_state_param(req,res) {

    try {

        let  {uid,shop_id} = req.body;

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'uid')
        }
        if(!shop_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'shop_id');
        }

        if(global_util.isNotNumber(shop_id)){

            return global_util.errorRequest(req,res,Code.PARAMETER_ERROR)
        }

        shop_id = global_util.parseIntThrowError(shop_id);

        return {uid,shop_id}


    }catch (e){

        logger.error(` /zhmd/device_manage/sensor/state_list.json check_sensor_state_param e:${e.message} `)

        throw e ;

    }

}


module.exports = router;

