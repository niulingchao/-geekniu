
const  router = require("express").Router({mergeParams:true});

const exp_anti_crowd = require('./experience_anti_crowd');

const  ZHMDCollector = require('../../index');
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');

const  global_util = require('../../common/assists')

router.post('/v10/c/shop/experience_crowd_five/crontab.json',async (req,res) =>{

    try {

        await exp_anti_crowd.handle_queue_five_minutes_ago();

        return   global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`experience_crowd five minutes   e:${e.message} `)

        return global_util.errorRequest(req,res,e.message);
    }
});

router.post('/v10/c/shop/experience_crowd_day/crontab.json',async (req,res) =>{

    try {

        await exp_anti_crowd.handle_queue_day();

        return   global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`experience_crowd day  e:${e.message} `)

        return global_util.errorRequest(req,res,e.message);
    }
});


module.exports = router;