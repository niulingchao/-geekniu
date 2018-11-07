/**
 * Created by yuanyuan on 17/10/17.
 */
const router           = require("express").Router({mergeParams:true});
const global_util      = require('../../common/assists')
const ZHMDCollector    = require('../../index')
const log4js           = ZHMDCollector.getConfig().log4js;
const logger           = log4js.log4js.getLogger('service');
const ReportSensor     = require('./core');

router.post('/v1/sensor_report.json',async function (req,res) {
    try{
        let messages = req.body.messages;

        if(typeof messages === 'undefined'){
            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'messages');
        }
    
        if(typeof messages === 'string'){
            try{
                messages = JSON.parse(messages);
            }catch(e){}
        }
    
        if(Array.isArray(messages)){
            //由于是上报接口,异常即可
            ReportSensor.insert_queue(messages);
        }
        return global_util.jsonResponse(res,true,req);
    }catch (e){
        logger.error(`/v1/sensor_report.json e:${e.message} `);

        return global_util.errorRequest(req,res,e.message);
    }
});

module.exports = router;