/**
 * Created by yuanyuan on 17/10/17.
 */
const  router = require("express").Router({mergeParams:true});
const sensor_report = require('../sensor/sensor_report');
const  global_util = require('../../common/assists')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');

const Experience_percent_handle      = require('./experience_percent_handle');
const Experience_percent_handle_new  = require('./experience_percent_handle_new');

router.post('/experience_percent/schedule.json',async function (req,res) {
    try{
        await Experience_percent_handle.calculate_experience_percent_value(sensor_report.hanle_photosensitive_sensor_task);

        return   global_util.jsonResponse(res,true,req);
    }catch (e){
        logger.error(`experience_percent schedule   e:${e.message} `);

        return global_util.errorRequest(req,res,e.message);
    }

});

router.post('/experience_percent/once.json',async function (req,res) {
    try{
        await Experience_percent_handle_new.calculate_experience_percent_value();

        return   global_util.jsonResponse(res,true,req);
    }catch (e){
        logger.error(`experience_percent once   e:${e.message} `);

        return global_util.errorRequest(req,res,e.message);
    }

});

router.post('/experience_percent/test_insert.json',async function (req,res) {
    try{
        await Experience_percent_handle_new.insert_queue(req.body.sensor_items);

        return global_util.jsonResponse(res,true,req);
    }catch (e){
        logger.error(`experience_percent once   e:${e.message} `);

        return global_util.errorRequest(req,res,e.message);
    }

});

module.exports = router;