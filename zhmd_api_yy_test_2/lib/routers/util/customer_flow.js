/**
 * Created by wuxueyu on 17/8/16.
 */
const router = require('express').Router({mergeParams:true});
const  ZHMDCollector = require('../../index');
const  Data = ZHMDCollector.getModel().Data;
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  Keygen  = ZHMDCollector.getModel().Keygen;
const  global_util = require('../../common/assists')
const  model_util = require('../../common/model_util')
const Code   = require('../../common/error_code')
const process = require("process")
const Promise = require('bluebird')
const mac_address_list = require(process.cwd() + "/middleware/filter/crowd").two_mac_address_list

router.post('/zhmd/customer_flow_ration/calculate.json',async (req,res,next) =>{

    try {


        await inner_calculate_door_ration(req.body)

        return global_util.jsonResponse(res,true,req)

    }catch (e){


        logger.error(`/zhmd/customer_flow_ration/calculate.json e:${e.message}`)

        global_util.errorRequest(req,res,e.message)

    }
})


async function inner_calculate_door_ration(body) {


    let {show_case_id} = body;

    if(!show_case_id){

        throw new Error('缺失必选参数 show_case_id')

        return;
    }

    let show_case = await model_util.find_one_doc_from_Data('show_case',{"id":show_case_id})

    if(show_case && Object.keys(show_case).length >0){

        if(show_case.data.use_type === 1){ // 只有为客流统计才计算

            await calculate_door_ration(show_case)

            //  await Data('sensor').update({"data.bind_show_case_id":show_case_id,"data.state":2},{$set:{"data.customer_flow_ration":global_util.parseFloatThrowError(ration)}},{ multi: true })

        }
    }

}



async  function calculate_door_ration(show_case) {


    let width = global_util.parseFloatThrowError(show_case["data"]["width"])

    let sensors = await Data('sensor').find({"data.bind_show_case_id":show_case.id,"data.state":2,"data.use_type":103}).exec()


    let two_mac_address = []; // 绑定双客流的

    let one_mac_address =[]; // 绑定正常客流的

    await Promise.map(sensors,async (sensor) =>{

        let  sensor_map = await model_util.find_one_doc_from_Data('crowd_sensor_map',{"data.start_mac_address":sensor.data.mac_address})

        if(!sensor_map || Object.keys(sensor_map).length <= 0){

            one_mac_address.push(sensor.data.mac_address);

        }else {
            two_mac_address.push(sensor.data.mac_address);
        }

    })

    logger.info(`calculate_door_ration one_mac_address： ${JSON.stringify(one_mac_address) }  two_mac_address：${JSON.stringify(two_mac_address)}`)

    let  half_ration = 0.5

    let  customer_ration = 0.85

    if(one_mac_address.length >0){

        let ration = calculate_ration(customer_ration,half_ration,width,sensors.length)

        logger.info(`one_mac_address：${ration}`)

        await Data('sensor').update({"data.mac_address":{"$in":one_mac_address},"data.state":2},{$set:{"data.customer_flow_ration":global_util.parseFloatThrowError(ration)}},{ multi: true })
    }

    if(two_mac_address.length >0){

        half_ration = 1;
        customer_ration = 1;
        let ration = calculate_ration(customer_ration,half_ration,width,sensors.length)

        console.log(`two_mac_address${ration}`)

        await Data('sensor').update({"data.mac_address":{"$in":two_mac_address},"data.state":2},{$set:{"data.customer_flow_ration":global_util.parseFloatThrowError(ration)}},{ multi: true })
    }

}


function calculate_ration(customer_ration,half_ration,width,sensor_count) {


    let  sensor_probe_distinct = 3.5;

    if(sensor_count == 0) return 0;

    if(global_util.isNotNumber(width)){ // 默认认为门款 小于 sensor_probe_distinct 基本不存在

        if(sensor_count == 1){

            return  half_ration * customer_ration;
        }else if(sensor_count >=2){

            return  half_ration * customer_ration * 0.5;
        }
    }

    if(width >= sensor_probe_distinct * 2){ // 大于两倍的 sensor_probe_distinct

        if(sensor_count == 1){

            return (width / sensor_probe_distinct * half_ration * customer_ration).toFixed(2);
        }else if(sensor_count >=2){

            return ((2 - (sensor_probe_distinct * 2 / width)) * half_ration * customer_ration).toFixed(2)
        }
    }else if(width <= sensor_probe_distinct){

        if(sensor_count == 1){

            return  half_ration * customer_ration;
        }else if(sensor_count >=2){

            return half_ration * customer_ration * 0.5;
        }

    }else{ //交叉

        if(sensor_count == 1){

            return(width / sensor_probe_distinct * half_ration * customer_ration).toFixed(2);;

        }else if(sensor_count >= 2){

            return ((1-(sensor_probe_distinct/(2 * width) )) * half_ration * customer_ration).toFixed(2)
        }
    }
}







// 备份
//
// async  function calculate_door_ration(show_case) {
//
//
//     let width = global_util.parseFloatThrowError(show_case["data"]["width"])
//
//     let sensors = await Data('sensor').find({"data.bind_show_case_id":show_case.id,"data.state":2,"data.use_type":103}).exec()
//
//     let is_two_mac_address =   sensors.some(function (sensor) {
//
//         return mac_address_list.some(function (mac_address) {
//
//             return sensor.data.mac_address == mac_address.start
//         })
//     })
//
//     let  half_ration = 0.5
//     let  customer_ration = 0.85
//
//     if(is_two_mac_address){
//
//         customer_ration = 1;
//         half_ration = 1;
//     }
//
//     let  sensor_probe_distinct = 3.5;
//
//     let sensor_count = sensors.length
//
//     if(sensor_count == 0) return 0;
//
//     if(global_util.isNotNumber(width)){ // 默认认为门款 小于 sensor_probe_distinct 基本不存在
//
//         if(sensor_count == 1){
//
//             return  half_ration * customer_ration;
//         }else if(sensor_count >=2){
//
//             return  half_ration * customer_ration * 0.5;
//         }
//     }
//
//     if(width >= sensor_probe_distinct * 2){ // 大于两倍的 sensor_probe_distinct
//
//         if(sensor_count == 1){
//
//             return (width / sensor_probe_distinct * half_ration * customer_ration).toFixed(2);
//         }else if(sensor_count >=2){
//
//             return ((2 - (sensor_probe_distinct * 2 / width)) * half_ration * customer_ration).toFixed(2)
//         }
//     }else if(width <= sensor_probe_distinct){
//
//         if(sensor_count == 1){
//
//             return  half_ration * customer_ration;
//         }else if(sensor_count >=2){
//
//             return half_ration * customer_ration * 0.5;
//         }
//
//     }else{ //交叉
//
//         if(sensor_count == 1){
//
//             return(width / sensor_probe_distinct * half_ration * customer_ration).toFixed(2);;
//
//         }else if(sensor_count >= 2){
//
//             return ((1-(sensor_probe_distinct/(2 * width) )) * half_ration * customer_ration).toFixed(2)
//         }
//     }
// }



module.exports ={
    router,
    inner_calculate_door_ration
};