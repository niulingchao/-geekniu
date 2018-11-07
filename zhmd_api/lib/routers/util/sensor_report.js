/**
 * Created by wuxueyu on 17/8/21.
 */
/**
 * Created by wuxueyu on 17/8/16.
 */
const router = require('express').Router({mergeParams:true});
const  ZHMDCollector = require('../../index');
const  Data = ZHMDCollector.getModel().Data;
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  global_util = require('../../common/assists')
const  model_util = require('../../common/model_util')


router.post('/zhmd/report/sendor_data_type/update.json',async (req,res,next) =>{

    try {

        let {data_type,mac_address} = req.body;

       if(data_type == 3){

           await Data('sensor').update({"data.mac_address":mac_address},{$set:{"data.type":1}})

       }else if(data_type == 1 || data_type == 0){

           await Data('sensor').update({"data.mac_address":mac_address},{$set:{"data.type":0}})

       }

        return global_util.jsonResponse(res,true,req)

    }catch (e){

        logger.error(`/zhmd/report/sendor_data_type/update.json e:${e.message}`)

        global_util.errorRequest(req,res,e.message)

    }

})




module.exports = router;
