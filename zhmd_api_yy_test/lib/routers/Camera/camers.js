/**
 * Created by wuxueyu on 17/9/8.
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
const request   = require('request-promise');
const  Keygen  = ZHMDCollector.getModel().Keygen;

const appSecret = "1b5cdd51679746dc9080d31f1d4855";
const admin_token = "c95c267e8bfa4ed0";
const appId = "lcc368c7f77e904260"
const token_identifier = "lechange"
const host = "https://openapi.lechange.cn:443/openapi/"


router.post('/zhmd/camers/bindDeviceList.json',async(req,res,next) =>{

    try{
        let {shop_id,uid} = req.body;

        if(global_util.isNotNumber(shop_id)){

            return global_util.errorRequest(req,res,'参数错误')
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,"uid");
        }

        let camera_deviceIds =  await Data('shop').distinct("data.camera_deviceIds",{"id":shop_id})

        if(camera_deviceIds.length === 0){

            return global_util.jsonResponse(res,[],req)
        }

        camera_deviceIds = camera_deviceIds.join(',')

        let token = await access_token({"phone":admin_token},uid)

        let bind_device_list_param = {"token":token,"deviceIds":camera_deviceIds}

        let result = await get_bind_device_list(bind_device_list_param);

        return global_util.jsonResponse(res,result,req);

    }catch(e){

        logger.error(`/zhmd/camers/bindDeviceList.json e:${e.message}`)

        return global_util.errorRequest(req,res,e.message)
    }

})


router.post('/zhmd/camers/access_token.json',async(req,res) =>{

    try {

        const {uid} = req.body;

        let token =  await access_token({"phone":admin_token},uid)

        return global_util.jsonResponse(res,token,req);

    }catch (e){

        logger.error(`/zhmd/camers/access_token.json e:${e._message}`)
        return global_util.errorRequest(req,res,e.message)

    }

})




async function get_bind_device_list(bind_device_list_param) {

    try {

        let time = getTimestampTenString();

        let nonce = global_util.md5(new Date().getTime() + 'a');

        let sign  = create_sign(bind_device_list_param,time,nonce)

        let body = {"system":system_template(sign,time,nonce),"params":bind_device_list_param,"id":Math.floor(Math.random() * 100)}

        let options = {
            'url'   : `${host}bindDeviceList`,
            'body'  : body,
            'method': 'POST',
            "json"  : true
        };

        let result = await request(options)

        if(result.result.code === '0'){  //成功

            return lodash.get(result,'result.data')
        }else {

            throw  new Error(lodash.get(result,"result.msg"))

        }

    }catch (e){


        logger.error(`get_bind_device_list e:${e.message}`)

        throw e;
    }
}



async function  access_token(params,uid) {


    let conditions = {"data.token_identifier":token_identifier}

    let token = await Data('access_token').findOne(conditions).exec()

    let time = getTimestampTenString();

    let nonce = global_util.md5(new Date().getTime());

    let sign  = create_sign(params,time,nonce)

    let body = {"system":system_template(sign,time,nonce),"params":params,"id":Math.floor(Math.random() * 100)}

    // token 更新时间10分钟
    if(!token || token.updated_at <=  new Date().getTime() - (10 * 60) * 1000){

        let options = {
            'url'   : `${host}accessToken`,
            'body'  : body,
            'method': 'POST',
            "json"  : true
        };
        let result = await request(options)

        if(result.result.code === '0'){ // 成功

            let ret_token =  lodash.get(result,"result.data.accessToken");

            if(!token){
                save_token(ret_token,uid)
            }else {

                Data('access_token').update({"id":token.id},{"$set":{"data.token":ret_token,"updated_at":new Date().getTime()}}).exec()
            }
            return ret_token;

        }else {

            throw new Error(lodash.get(result,'result.msg'))
        }
    }else {

        return token.data.token
    }

}

function system_template(sign,time,nonce) {

    return {"ver":"1.0",
        "sign":sign,
        "appId":appId,
        "time": time,
        "nonce": nonce
    };
}

function create_sign(params,time,nonce) {

    let keys = Object.keys(params)

    keys.sort();

    let str = "";

    for(let i of keys){

        str+= i + ":" + params[i]+ ","
    }
    str = str + "time:" + time + "," + "nonce:" + nonce + "," + "appSecret:" + appSecret
    return  md5(str)

}

//save token
async function save_token(token,uid) {

    try{

        var data = new Data('access_token')();

        const key = await Keygen.issuePromise();

        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = {
            "token":token,
            "token_identifier":token_identifier
        };
        return  await data.save();

    }catch (e){

        logger.error(`save_token e:${e.message}`);

        throw e;
    }
}


function getTimestampTenString() {
    return parseInt((new Date().getTime() / 1000)) ;
}


module.exports = router;