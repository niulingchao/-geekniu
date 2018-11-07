const router = require('express').Router({mergeParams:true})
const moment = require('moment')
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service')
const  global_util = require('../../common/assists')
const get_client = require(process.cwd() + "/analysis/mongoClient.js")
router.post('/zhmd/experience_time.json', async (req,res,next) =>{
    try {
        let  {mac_address,data_type,timestamp} = req.body

        if(!mac_address) {
            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'mac_address')
        }

        if(!data_type) {
            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'data_type')
        }

        let result = calculate_experience_time(mac_address,data_type,timestamp);

        return global_util.jsonResponse(res,result,req)

    } catch (e) {

        logger.error(`/zhmd/experience_time.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);
    }
})
const calculate_experience_time = async function (mac_address,data_type,timestamp) {

    let result = {};
    if(data_type !== 1) {
        result.frequency = 0;
        result.duration = 0;
        return result
    }
    //拿起放下间隔时间的有效值 单位:s
    let onOffSeparateTime = [40,1800];
    let nowUnix ;
    if(!timestamp) {
        nowUnix = moment().unix();
    }else{
        nowUnix = parseInt(timestamp/1000);
    }
    nowUnix = parseInt(nowUnix);

    let client = await get_client();
    let collection  = client.db('analysis_experience_time_report').collection('event_datas')
    //查找上次拿起的时间 计算差值
    let where ={"$and":[ {'event_attr.mac_address' : mac_address}, {'event_attr.report_data_type' : 2},{"timestamp" : {"$lt":nowUnix * 1000, "$gt" : (nowUnix-onOffSeparateTime[1]) * 1000} } ]}

    let doc = await find_last_exprience_time_doc(collection,where);

    if (doc ===null) {
        result.frequency = 0;
        result.duration = 0;
        return result
    }
    let realSeparateTime =  nowUnix - parseInt(doc.timestamp/1000);
    if(realSeparateTime > 0 && realSeparateTime<onOffSeparateTime[0]) {
        result.frequency = 0;
        result.duration = realSeparateTime;
    } else if (realSeparateTime >= onOffSeparateTime[0] && realSeparateTime<onOffSeparateTime[1]){
        result.frequency = 1;
        result.duration = realSeparateTime;
    } else {
        result.frequency = 0;
        result.duration = 0;
    }
    return result

}

function find_last_exprience_time_doc(collection,where) {

    return new Promise((s,r) =>{

        collection.findOne(where,{fields:{'timestamp':1},sort:{'timestamp':-1}},function(error, doc){

            if(error){
              return r(error);
            }
            s(doc)
        });

    })
}

module.exports.router = router;


module.exports.calculate_experience_time = calculate_experience_time;