/**
 * Created by wuxueyu on 17/9/26.
 */
const router = require('express').Router({mergeParams:true})

const normalUtil                = require('normalutil');
const numeral                   = require('numeral');
const lodash                    = require('lodash')
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  global_util = require('../../common/assists')
const  model_util = require('../../common/model_util')
const  Promise    = require('bluebird');
const Constant      = require("./constant")
const process = require("process")
const  Data = ZHMDCollector.getModel().Data
const  Keygen  = ZHMDCollector.getModel().Keygen;

const calculate_door_ration = require('../util/customer_flow').inner_calculate_door_ration


router.post('/a/sensor/two_mac_address/bind.json',async(req,res,next) =>{

    let {mac_address_a,mac_address_b,shop_id,uid} = req.body;

    if(!shop_id){

        return   global_util.errorRequest(req,res,Code.MISS_PARAMS,'shop_id')
    }

    if(!mac_address_a){

        return  global_util.errorRequest(req,res,Code.MISS_PARAMS,'mac_address_a');
    }

    if(!mac_address_b){

        return global_util.errorRequest(req,res,Code.MISS_PARAMS,'mac_address_b')
    }

    if(!uid){

        return global_util.errorRequest(req,res,Code.MISS_PARAMS,"uid")
    }

    let mac_address = await model_util.find_one_doc_from_Data("sensor",{"data.mac_address":mac_address_a})

    if(!mac_address || Object.keys(mac_address).length <=0){

        return  global_util.errorRequest(req,res,`mac_address:${mac_address_a} 未绑定`)
    }

    let shop =  await  model_util.find_one_doc_from_Data('shop',{"id":shop_id});

    if(!shop || Object.keys(shop).length <=0){

        return  global_util.errorRequest(req,res,`shop_id:${shop_id} 不存在`)
    }

    // 删除
    let remove_conditions = {"$or":[{"data.start_mac_address":mac_address_a},{"data.end_mac_address":mac_address_b}]}

    await Data('crowd_sensor_map').remove(remove_conditions)

    await save_crowd_sensor_map(shop,mac_address_a,mac_address_b,uid)

    await calculate_door_ration({"show_case_id":mac_address.data.bind_show_case_id})


    return global_util.jsonResponse(res,true,req)


})

async function save_crowd_sensor_map(shop,mac_address_a,mac_address_b,uid) {

    try {

        const key = await Keygen.issuePromise();
        let  data = new Data('crowd_sensor_map')();
        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = {

            "shop_id":shop.id,
            "head_office_id":parseInt(shop.data.head_office_id),
            "shop_name":shop.data.shop,
            "start_mac_address":mac_address_a,
            "end_mac_address":mac_address_b,
            "heartbeat_time":new Date().getTime()
        };
        return await data.save();

    }catch (e){

        logger.error(`/a/sensor/two_mac_address/bind.json  save_crowd_sensor_map e:${e.message}`)

        throw e;
    }

}

module.exports = router;