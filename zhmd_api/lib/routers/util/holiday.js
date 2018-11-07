const router = require('express').Router({mergeParams:true})
const moment = require('moment')
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service')
const  global_util = require('../../common/assists')
const Holidays = require(process.cwd() + "/lib/chinese_holiday.js")
router.post('/zhmd/holiday.json', async (req,res,next) =>{
    try {
        let  {date_time} = req.body
        //未传date_time 参数 默认查询本天
        if(!date_time) {
            date_time = moment().format('YYYY-MM-DD')
        }
        let result = {};

        result.date_time = date_time

        let weekDes = [
            '星期日','星期一','星期二','星期三','星期四','星期五','星期六'
        ];

        result.week = weekDes[new Date(date_time).getDay()]

        if(Holidays.isHoliday(date_time)){
            result.holiday = Holidays.event(date_time)
        }

        return global_util.jsonResponse(res,result,req)

    } catch (e) {

        logger.error(`/zhmd/holiday.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);
    }
})

module.exports = router;