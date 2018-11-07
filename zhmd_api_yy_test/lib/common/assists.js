/**
 * Created by wuxueyu on 17/7/25.
 */

const util = require('util')
const Code = require('../common/error_code')
const  ZHMDCollector = require('../index')
const  log4js        = ZHMDCollector.getConfig().log4js
const logger = log4js.log4js.getLogger('service');
const debug_logger = log4js.log4js.getLogger('debug');
const lodash = require('lodash');
const crypto = require('crypto')
const process  = require('process')
const fs = require('fs-extra')
const path = require('path')


const  global_util = {};

const MAIN_URL_IN_HEADER_NAME = 'main_url';

global_util.isNumber = function (num) {
    if(isNaN(num) || isNaN(parseFloat(num))){
        return false;
    }else{
        return true;
    }
};

global_util.isNotNumber = function (num) {
    if(isNaN(num) || isNaN(parseFloat(num))){
        return true;
    }else{
        return false;
    }
};

global_util.splite_string_to_array = function(input,spite_character){

    if(!(typeof input === 'string')){

        input += '';
    }
    let repalce_param = '(^'+spite_character+')'+'|('+spite_character+'$)';

    return input.replace(/repalce_param/g,'').split(spite_character).filter(v=> v!='');


}

global_util.jsonResponse = function (response, result,req) {
    if (util.isArray(result)) {
        for (var key in result) {
            if (!util.isUndefined(result[key]._id)) {
                result[key].id = result[key]._id;
                delete result[key]._id;
            }

            delete result[key].__v;
            delete result[key].password;
            delete result[key].counter_data;
        }

        let res_result = {result: result,error_code: 0};
        interface_logger(req,res_result);
        return response.json(res_result);
    }

    if (!util.isUndefined(result._id)) {
        delete result._id;
        delete result.__v;
    }

    let res_result = {result: result,error_code: 0};
    interface_logger(req,res_result);
    return response.json(res_result);
};


// error request handle
global_util.errorRequest = function (req,res, msg) {
    var code = 200;
    if (!util.isUndefined(msg.error_code)) {
        var error_msg = Object.assign({},msg);

        if (arguments.length > 3 && error_msg.error_msg.indexOf('%s') > 0) {
            for (var key in arguments) {
                if (0 == key || 1 == key || 2 == key) continue;
                //error_msg.desc = util.format(error_msg.desc, arguments[key]);
                error_msg.error_msg  = util.format(error_msg.error_msg, arguments[key]);
            }
        }

        error_msg.request = req.url;
        delete error_msg.desc;

        interface_logger(req,error_msg,true);
        return res.status(code).json(error_msg);
    }

    var sys_msg = Code.SYSTEM_ERROR;

    if(typeof msg === 'string'){
        sys_msg.error_msg = msg;
    }else if(typeof msg === 'object'){
        sys_msg.error_msg = JSON.stringify(msg);
    }

    let result = {
        request     : req.url,
        error_code  : sys_msg.error_code,
        error_msg   : sys_msg.error_msg
    };

    interface_logger(req,result,true);
    return res.status(code).json(result);
};



//url=/trip/find.json | param={} | result={}
function interface_logger(req,result,is_error) {
    let ip  = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (ip && ip.substr(0, 7) == "::ffff:") {
        ip = ip.substr(7)
    }
    let main_url = req.get(MAIN_URL_IN_HEADER_NAME) || req.url;
    const timeout = new Date() - req.interface_start_time;
    const monit_name = req.monit_name;
    let monit_print = "";

    if(typeof monit_name !== 'undefined'){
        monit_print = ` | monit_name=${monit_name}`;
    }

    if(is_error){
        debug_logger.error('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(req.body) + ' | result=' + JSON.stringify(result));
        logger.error('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(req.body) + ' | result=' + JSON.stringify(result) + ' | timeout=' + timeout);
    }else{
        if(main_url === req.url){
            debug_logger.info('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(req.body) + ' | result=' + JSON.stringify(result));
        }else{
            debug_logger.debug('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(req.body) + ' | result=' + JSON.stringify(result));
        }

        let body = JSON.parse(JSON.stringify(req.body));
        if(lodash.has(body,'output_filter')){
            delete body.output_filter
        }

        if(req.url === '/extend/push.json'){
            logger.debug('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(body) + ' | timeout=' + timeout);
        }else{
            logger.info('ip=' + ip + ' | url=' + req.url + ' | main_url=' + main_url + monit_print + ' | param=' + JSON.stringify(body) + ' | timeout=' + timeout);
        }
    }

}


global_util.md5 = function (key) {
    if(typeof key != 'string'){
        key += '';
    }

    if(key){
        key  = crypto.createHash('md5').update(key).digest("hex");
    }
    return key;
};


global_util.get_temp_file_unique_path_primise = function (key) {

    return new Promise((resolve,reject) =>{

        let temp_path = '/tmp/' + global_util.md5(process.cwd());
        fs.mkdirs(temp_path,function (err,result) {
            if(err) reject(err);
            resolve(temp_path + '/' + key);
        });

    })

}

// 移动文件
function file_mv_promise(file,file_path) {

    return new Promise((resolve,reject) => {

        file.mv(file_path,(err) =>{
            if(err){

                reject(err);
            }
            resolve();
        })

    })
}

global_util.mv_file_to_generate_tmp_path = async function (file) {

    let extname = path.extname(file.name);

    let tmp_path = await global_util.get_temp_file_unique_path_primise(file.name)

    await file_mv_promise(file,tmp_path);

    return tmp_path;

}


global_util.parseIntThrowError = function (number) {
    try{
        return parseInt(number);
    }catch (e){
        logger.error(`Util parseIntThrowError error,e = ${e.message} ,number = ${number}`);
        throw e;
    }
};

global_util.parseFloatThrowError = function (number) {
    try{
        return parseFloat(number);
    }catch (e){
        logger.error(`Util parseFloatThrowError error,e = ${e.message} ,number = ${number}`);
        throw e;
    }
};

global_util.md5 = function (key) {
    if(typeof key != 'string'){
        key += '';
    }
    if(key){
        key  = crypto.createHash('md5').update(key).digest("hex");
    }
    return key;
};


global_util.splite_string_to_array = function(input,spite_character){

    if(!(typeof input === 'string')){

        input += '';
    }
    let repalce_param = '(^'+spite_character+')'+'|('+spite_character+'$)';

    return input.replace(/repalce_param/g,'').split(spite_character).filter(v=> v!='');


}




module.exports = global_util;