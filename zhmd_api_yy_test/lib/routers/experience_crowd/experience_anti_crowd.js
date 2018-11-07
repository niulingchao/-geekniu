const router = require('express').Router({mergeParams:true})

const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');

const  global_util = require('../../common/assists')

const crowd_experience = require('../util/experience_anti_crowd');


router.post('/v10/c/shop/experience_crowd_ten/crontab.json',async (req,res) =>{

    try {

        await crowd_experience.handle_queue_ten_minutes_ago();

        return   global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`experience_crowd ten minutes   e:${e.message} `)

        return global_util.errorRequest(req,res,e.message);
    }
});

router.post('/v10/c/shop/experience_crowd_day/crontab.json',async (req,res) =>{

    try {

        await crowd_experience.handle_queue_day();

        return   global_util.jsonResponse(res,true,req);

    }catch (e){

        logger.error(`experience_crowd day  e:${e.message} `)

        return global_util.errorRequest(req,res,e.message);
    }
});

module.exports = router;