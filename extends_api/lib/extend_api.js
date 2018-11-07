'use strict';

// fix//

const fs                    = require('fs');
const path                  = require('path');
const process               = require('process');
const http                  = require('http');
const util                  = require('util');
const request               = require('request-promise');
const extend_constant_obj   = require('./extend_constant');
const removeRoute           = require('./remove_router');
const join                  = require(process.cwd() + '/lib/join.js');
const Promise               = require('bluebird');
const lodash                = require('lodash');
const deasync               = require('deasync');
const CryptoJs              = require('crypto-js');
const secret_key            = '8d26c846ca909ce72db342a12f2c3fd5';
const querystring           = require('querystring');
const url                   = require('url');
const of_join               = require(process.cwd() + '/lib/of_join.js');
const Message               = require(process.cwd() + '/cluster_models/message');
const MessageConstants      = require(process.cwd() + '/cluster_models/constants');
const DataRouter            = require(process.cwd() + '/routers/data');
const Constants             = require(process.cwd() + '/env/constants');

Promise.config({
    // enable cancellation ability for promises
    cancellation: true
});
//from baas_code import
let port;
let host;
let log4js;
let logger;
let Code;
let Keygen;
let extend_constant;
let conf;
let analysis_server_url;
let debug_logger;
let cluster_logger;

let url_pattern = /^(https?):\/\//gi;
let encr_flag = process.env.PATTERN == 'encryption'?true:false;
const EXPRESSION_ERROR_TYPE = 'expression_error';
const URL_SOURCE_ANALYSIS = 'analysis';
var file_listener = {};
const IGNORE_DO_BATCH_ERROR = true;
const NOT_IGNORE_DO_BATCH_ERROR = false;
const CONDITIONS_WHITE_LIST = ['find.json','/field_to_array.json','/util/calculate.json','/analysis/custom/routers/util_calculate','/util/excel/export','/util/calcu_and_reset_counter.json','/analysis/util/corwd_count/calculate.json','/analysis/util/corwd_time_scale/calculate.json'];
const BATCH_BEHAVIOUR_SERIAL = 'serial';
const BATCH_BEHAVIOUR_PARALLEL = 'parallel';
const CALL_INTERFACE_BEHAVIOUR_ASYNC = 'async';
const CALL_INTERFACE_BEHAVIOUR_SYNC = 'sync';

var proto = module.exports = function (app, router,dependence_obj) {
    init(dependence_obj);
    
    function init(dependence_obj) {
        if(dependence_obj.conf)     conf    = dependence_obj.conf;
        if(dependence_obj.log4js)   log4js  = dependence_obj.log4js;
        if(dependence_obj.code)     Code    = dependence_obj.code;
        if(dependence_obj.keygen)   Keygen  = dependence_obj.keygen;
        
        
        logger = log4js.log4js.getLogger('service');
        debug_logger = log4js.log4js.getLogger('debug');
        cluster_logger = log4js.log4js.getLogger('cluster');

        port = conf.port || 18888;
        host = 'http://127.0.0.1:' + port;
        if(conf.analysis_server_url){
            analysis_server_url = conf.analysis_server_url.slice(0,-1);
        }

        extend_constant = new extend_constant_obj(dependence_obj);
    }
    
    function extend (req, res, next) {
        next();
    }
    
    extend.__proto__ = proto;
    extend.extendPath = conf.extend_path;
    
    proto.path = process.cwd() + '/' + extend.extendPath;
    router.route('/extend/push.json').post(function (req, res) {
        if (util.isUndefined(req.body.name)) {
            return errorRequest(req, res, Code.MISS_PARAMS, 'name');
        }
        
        if (util.isUndefined(req.body.define) || !util.isObject(req.body.define)) {
            return errorRequest(req, res, Code.ILLEGAL_PARAMS, 'define', 'object', typeof req.body.define);
        }
        
        
        var name = req.body.name;
        var define = JSON.stringify(req.body.define);
        if(encr_flag){
            let encr_key = md5(secret_key);
            define = CryptoJs.AES.encrypt(define,encr_key);
        }

        //发送重新加载的消息
        send_router_reload_msg(proto.path + '/' + name + '.json');
        fs.writeFile(proto.path + '/' + name + '.json', define, function (err) {
            if (err) {
                return errorRequest(req, res, err);
            }
            
            restart_api(app,router,proto.path + '/' + name + '.json');
            return jsonResponse(res, true,req);
        });
    });
    
    router.route('/extend/delete.json').post(function (req, res) {
        if (util.isUndefined(req.body.name)) {
            return errorRequest(req, res, Code.MISS_PARAMS, 'name');
        }
        
        if (util.isUndefined(req.body.uri)) {
            return errorRequest(req, res, Code.MISS_PARAMS, 'uri');
        }
        
        var name = req.body.name;
        var uri  = req.body.uri;
        fs.unwatchFile(proto.path + '/' + name + '.json',file_listener[proto.path + '/' + name + '.json']);
        //发送重新加载的消息
        send_router_remove_msg(uri);
        fs.unlink(proto.path + '/' + name + '.json', function (err,result) {
            if (err) {
                logger.error(err);
                return errorRequest(req, res, err);
            }
            
            removeRoute(app, uri);
            return jsonResponse(res, true,req);
        });
    });
    
    proto.params = {
        app: app,
        router: router
    };
    
    proto.reload(app, router);
    
    return extend;
};

proto.reload = function (app, router) {
    if (proto.reloading) {
        return false;
    }

    debug_logger.debug('Reloading...');
    
    fs.readdir(proto.path, function (err, files) {
        for (var key in files) {
            var filename = path.join(proto.path, files[key]);
            
            if (filename.slice(-4) === 'json') {
                
                restart_api(app,router,filename);
            }
        }
        
        proto.reloading = false;
    });
};

async function send_router_reload_msg(filename) {
    if(!is_cluster()){
        return;
    }

    cluster_logger.info(`worker send_router_reload_msg filename = ${filename}`);
    const message_id = await Keygen.issuePromise();
    const content = {
        filename
    };
    const message = new Message(process.pid,MessageConstants.MESSAGE.MESSAGE_TYPE_ROUTER_RELOAD,message_id,content);
    process.send(message);
}

async function send_router_remove_msg(uri) {
    if(!is_cluster()){
        return;
    }

    cluster_logger.info(`worker send_router_remove_msg uri = ${uri}`);
    const message_id = await Keygen.issuePromise();
    const content = {
        uri
    };
    const message = new Message(process.pid,MessageConstants.MESSAGE.MESSAGE_TYPE_ROUTER_REMOVE,message_id,content);
    process.send(message);
}


proto.reload_assign_api = function(app,router,filename){
    debug_logger.debug('Reloading assign api...');

    restart_api(app,router,filename);
};

function restart_api(app,router,filename) {
    fs.readFile(filename, 'UTF-8', function (err, doc) {
        try {
            if(encr_flag){
                let decr_key = md5(secret_key);
                let bytes = CryptoJs.AES.decrypt(doc.toString(),decr_key);
                var configValue = JSON.parse(bytes.toString(CryptoJs.enc.Utf8));
            }else{
                var configValue = JSON.parse(doc);
            }
        } catch (e) {
            logger.error('Error: Load config file ' + filename + ' failed!');
            //上面fs.readdir是一个循环,fs.readFile是一个异步方法,所以使用return结束当前非法json格式的接口,而不是continue
            return;
        }
        
        function listener() {
            try {
                restart_api(app,router,filename);
            } catch (e) {
                logger.error('module reload failed!');
            }
        }
        
        fs.unwatchFile(filename,file_listener[filename]);
        fs.watchFile(filename, listener);
        file_listener[filename] = listener;
        
        var uri = configValue.uri;

        removeRoute(app, uri);
        debug_logger.debug('[*] Load extend module: ' + configValue.name + ',uri=' + uri);
        
        
        var api_type = configValue.api_type;
        
        if (api_type === extend_constant.api_type.combined_api) {
            router.route(uri).post(async function (req, res) {
                let config = JSON.parse(JSON.stringify(configValue));
                var resultObj = {};
                var totalCount = {};
                let middleResArrObj = {
                    'middleResArr': null
                };
                set_monit_name_to_req(req,config);

                try {
                    await makeCombinedRequest(req, res, config.sub_api, resultObj, totalCount,middleResArrObj);

                    // To perform Join, config.join_rules must be an array
                    if (util.isArray(config.join_rules) && config.join_rules.length > 0) {
                        // todo: join rules validation
                        
                        try {
                            let join_rules_origin = Array.from(config.join_rules);
                            // do join
                            resultObj = join.doJoin(resultObj, config.join_rules);
                            
                            //of_loin
                            if((!util.isUndefined(config.of_join.params) && config.of_join.params.length > 0) || (!util.isUndefined(config.of_join.sort_by) && config.of_join.sort_by.length > 0)) {
                                // user_param structure from pseudo sub api, with method: "of_join" (regularly, "post")
                                let of_join_user_params = lodash.toArray(lodash.pickBy(config.sub_api, function (obj) {
                                    return obj.method === 'of_join';
                                }))[0].user_params;
                                

                                let user_params = extend_constant.build_user_params(of_join_user_params, req.body);
                                if (-1 == user_params.status) {
                                    // this will return the response with error
                                    return errorRequestForExtendApi(req, res, Code.MISS_PARAMS, middleResArrObj.middleResArr);
                                }


                                let of_join_config;
                                try {
                                    
                                    of_join_config = extend_constant.build_default_params(config.of_join, user_params);
                                }
                                catch (e) {
                                    logger.error('Error building default params: ' + e.toString());
                                    return errorRequestForExtendApi(req, res, Code.SYSTEM_ERROR,middleResArrObj.middleResArr);
                                }
                                
                                totalCount['total_count'] = resultObj[join_rules_origin[join_rules_origin.length - 1]['as']].length;
                                
                                resultObj = of_join.handle_join(resultObj,of_join_config);
                            }
                            
                        }
                        catch (e) {
                            logger.error('Join failed, result data is not altered. Error: ' + e.toString());
                        }
                    }
                    else {
                        debug_logger.debug('No join rules.');
                    }

                    debug_logger.debug('Combined API <' + config.name + '> completed');

                    try{

                        handle_combined_of_result_erase_hierarchy(req,config,resultObj);

                    }catch (e){

                        logger.error(`handle_combined_of_result_erase_hierarchy e:${e.message}`)

                    }


                    return jsonResponseCombinedApi(res, resultObj, totalCount,req,middleResArrObj.middleResArr);
                }
                catch (err) {
                    logger.error('Request caught an error: ' + err.toString() + ' ,uri = ' + req.url);
                    
                    var errType = Code.SYSTEM_ERROR,
                        errDetail = '';
// throw {type: 'miss_params', detail: '', url: sub_uri};
                    if (typeof err == 'object') {
                        if (err.type == 'user_params') {
                            errType = Code.ILLEGAL_PARAMS;
                            errDetail = err.detail;
                        }
                        else if (err.type == 'miss_params') {
                            errType = Code.MISS_PARAMS;
                            errDetail = err.detail;
                        }else if (err.type == EXPRESSION_ERROR_TYPE) {
                            errType = JSON.parse(err.detail);
                        }else if(err.type == 'error_code_above_zero'){
                            return errorRequestForExtendApi(req, res, err.detail,middleResArrObj.middleResArr);
                        }else if (!util.isUndefined(err.error) && err.error.code === 'ETIMEDOUT') {
                            logger.error('Request timed out: ' + err.options.uri);
                        }
                    }

                    return errorRequestForExtendApi(req, res, errType,middleResArrObj.middleResArr);
                }
            });
        } else if (api_type === extend_constant.api_type.pro_op_api) {
            router.route(uri).post(async function (req, res) {
                let config = JSON.parse(JSON.stringify(configValue));
                var resultObj = {};
                let lastReqBody = {"body":''};
                // flag for keeping return values by find_batch
                resultObj.isFirstRound = true;
                let isFindBatch = false;
                let middleResArrObj = {
                    'middleResArr': null
                };
                set_monit_name_to_req(req,config);
                try {
                    await makeProOpRequest(req, res, config.sub_api, resultObj,isFindBatch,lastReqBody,middleResArrObj,NOT_IGNORE_DO_BATCH_ERROR);

                    // remove flag before output
                    delete resultObj.isFirstRound;

                    debug_logger.debug('Pro op API <' + config.name + '> completed.');

                    try {
                        handle_pro_op_of_result_erase_hierarchy(req,lastReqBody,resultObj);
                    }catch (e){

                        logger.error(`handle_pro_op_of_result_erase_hierarchy e:${e.message}`)
                    }

                    return jsonResponseCustomForExtendsApi(res, resultObj,req,middleResArrObj.middleResArr);
                }
                catch (err) {
                    logger.error('Request caught an error:');
                    logger.error(err);
                    var errType = Code.SYSTEM_ERROR;
                    
                    if (typeof err == 'object') {
                        if (err.type == 'ask_not_pass') {
                            if (typeof err.detail === 'object') {
                                errType = err.detail;
                                // response with custom error msg object
                                return errorRequestForExtendApi(req, res,errType,middleResArrObj.middleResArr);
                            }
                        }
                        else if (err.type == 'ask_ifelse_error') {
                            logger.error('Ask-ifelse execution failed on: ' + err.url + '. Reason: ' + err.detail);
                        }
                        else if (err.type == 'unexpected_subapi_type') {
                            logger.error('Unexpected sub api type on: ' + err.url + '. Reason: ' + err.detail);
                        }
                        else if (err.type == 'error_code_above_zero') {
                            logger.error('Error code above zero: ' + err.toString());
                            return errorRequestForExtendApi(req, res, err.detail,middleResArrObj.middleResArr);
                        }
                        else if (err.type == 'miss_params') {
                            return errorRequestForExtendApi(req, res, Code.MISS_PARAMS,middleResArrObj.middleResArr,err.detail);
                        }
                        else if (err.type == EXPRESSION_ERROR_TYPE) {
                            errType = JSON.parse(err.detail);
                        }
                        else if (err.type == '__loop_item_error') {
                            logger.error(err.detail);
                            errType = err.detail;
                        }
                        else if (!util.isUndefined(err.error) && err.error.code === 'ETIMEDOUT') {
                            logger.error('Request timed out: ' + err.options.uri);
                        }
                        else if(err.error_code > 0 && typeof err.error_msg !== 'undefined'){
                            errType = lodash.merge({},err);
                        }
                        else {
                            if (!util.isUndefined(err.url)) {
                                logger.error('Request failed: ' + err.url);
                            }
                            else if (!util.isUndefined(err.options) && !util.isUndefined(err.options.uri)) {
                                logger.error('Request failed: ' + err.options.uri);
                            }
                        }
                    }
                    
                    // response with system error
                    return errorRequestForExtendApi(req, res, errType,middleResArrObj.middleResArr);
                }
            });
        }
        
        app.use('/', router);
    });
}

// 处理 combined api of_result_erase_hierarchy逻辑
function handle_combined_of_result_erase_hierarchy(req,config,resultObj) {

    let output_filter;

    if(req.body['output_filter']){

        output_filter = req.body['output_filter'];

    }

    let last_api;
    if(config.sub_api.length >0){

        last_api = config.sub_api[config.sub_api.length -1];
    }

    if(last_api){

        for(let obj_item of last_api["default_params"]){

            if(obj_item["output_filter"]){

                output_filter = obj_item["output_filter"];
                break;

            }

        }

    }

    if( typeof output_filter != 'undefined'){

        if(typeof output_filter == 'string'){

            output_filter =  JSON.parse(output_filter);

        }

        if(typeof output_filter['of_result_erase_hierarchy'] != 'undefined'){

            let result_erase_hierarchy_out_filter = output_filter['of_result_erase_hierarchy'];
            let paths = result_erase_hierarchy_out_filter.paths;

            if(Array.isArray(paths)){
                handle_result_erase_hierarchy(paths,resultObj);
            }
        }

    }



}

function handle_pro_op_of_result_erase_hierarchy(req,lastReqBody,resultObj) {

    let output_filter;

    if(req.body['output_filter']){

        output_filter = req.body['output_filter'];

    }

    if(lastReqBody['body']['output_filter']){

        output_filter = lastReqBody['body']['output_filter'];
        // break;
    }

    if(typeof output_filter != 'undefined'){

        if(typeof output_filter['of_result_erase_hierarchy'] != 'undefined'){

            let result_erase_hierarchy_out_filter = output_filter['of_result_erase_hierarchy'];
            let paths = result_erase_hierarchy_out_filter.paths;
            if(Array.isArray(paths)){
                handle_result_erase_hierarchy(paths,resultObj);
            }
        }

    }
}

async function makeCombinedRequest (req, res, subApi, resultObj, totalCount,middleResArrObj) {
    if (!Array.isArray(subApi)) {
        subApi = [subApi];
    }
    
    let subApiInx = 0, middleResArr = [];
    middleResArrObj.middleResArr = middleResArr;

    for(let sub_i = 0;sub_i < subApi.length;sub_i++) {
        const api = subApi[sub_i];

        let lastBodyCache = {};

        // skip the pseudo sub api for of_join
        if (api['method'] === 'of_join') continue;

        var sub_uri = api['sub_uri'];
        var ret_key = api['ret_key'];
        var default_params = api['default_params'];
        var user_params = api['user_params'];
        var sort_by = api['sort_by'];
        let content_type = api['content_type'] || 'json';
        let method = api['method'] || 'post';
        var limit = api['limit'];
        const url_source = api['url_source'];
        var body = req.body;

        //for analysis api
        if(url_source === URL_SOURCE_ANALYSIS && !sub_uri.match(url_pattern)){
            sub_uri = analysis_server_url + sub_uri;
        }

        // PREPROCESSING
        // if not starts with http:// or https:// then attach the baas internal domain/IP address
        if (!sub_uri.match(url_pattern)) {
            sub_uri = host + sub_uri;
        }

        middleResArr[subApiInx] = {};
        user_params = extend_constant.build_user_params(user_params, body);
        if (-1 == user_params.status) {
            // throw an error to stop the sequence
            throw {type: 'miss_params', detail: user_params.name, url: sub_uri};
        }


        let var_solved_params = handle_user_params({}, lastBodyCache, {}, default_params, false, middleResArr);


        if (var_solved_params === null) throw {type: 'param_replace_error', detail: '', url: sub_uri};

        try {
            var built_params = extend_constant.build_default_params(var_solved_params, user_params);

        } catch (e) {
            handle_expression_error(e,sub_uri);
            throw {type: 'miss_params', detail: '', url: sub_uri};
        }

        if (is_need_remove_condtions(sub_uri)) {
            built_params = extend_constant.handle_object(built_params);
        }

        let params = extend_constant.merge_params(built_params, sort_by, limit);

        debug_logger.debug('params=');
        debug_logger.debug(params);
        
        // MAKING REQUEST
        let reqObj = {
            uri: sub_uri,
            body: params,
            method: method,
            content_type: content_type
        };

        reqObj = set_main_url_param_to_reqObj(reqObj,req);
        var result = await syncRequest(reqObj);

        // POST PROCESSING
        if (result.err !== null) {
            // error handling
            throw result.err;
            // end of error handling
        }
        else if (result.res !== null) {
            let res = result.res;

            debug_logger.debug('Current request got response: ' + JSON.stringify(res));

            // exit on any error from the response
            if (!util.isUndefined(res.error_code) && res.error_code > 0) {
                throw {type: 'error_code_above_zero', detail: res, url: sub_uri};
            }

            // put current response into middle result array
            middleResArr[subApiInx] = (res == null) ? {} : Object.assign({},res);

            resultObj[ret_key] = res['result'];

            Object.assign(lastBodyCache, res);
            delete res['error_code'];
            delete res['result'];

            // put a value into totalCount
            Object.assign(totalCount, res);

            subApiInx++;
        }
    }

}

async function makeProOpRequest (req, response, subApi, resultObj, isFindBatch,lastReqBody,middleResArrObj,ignore_do_batch_error) {

    if (!Array.isArray(subApi)) {
        subApi = [subApi];
    }
    var lastBodyCache = {}; // caches the response body of last request
    var flag = null, // ask-and and ask-or logical flag
        ask_ifelse_exec = null, // ask-ifelse logical flag
        batchApi = []; // batch ask/do task container
    let subApiInx = 0,ask_do_flag = true,middleResArr = [];
    if(middleResArrObj) middleResArrObj.middleResArr = middleResArr;

    for(let sub_i = 0;sub_i < subApi.length;sub_i++){
        const api = subApi[sub_i];

        let willUseFindBatch = false;
        var method = api['method'];
        let content_type = api['content_type'] || 'json';
        var sub_uri = api['sub_uri'];
        var sub_api_type = api['sub_api_type'];
        var sub_api_related_type = api['sub_api_related_type'];
        var loopPath = api['sub_api_loop_item'];
        let importKey = api['sub_api_loop_item_import_key'];
        let importKeyContent = api['import_key_content'];
        let findBatchResultKey = api['find_batch_result_key'];
        let findBatchReturnKey = api['find_batch_return_key'];
        let findBatchTotalCount = api['find_batch_total_count']; // bool
        const url_source    = api['url_source'];

        var error_ret = api['error_ret'];
        var default_params = api['default_params'];
        var user_params = api['user_params'];
        var sort_by = api['sort_by'];
        var limit = api['limit'];
        //0 :结果为空时通过    1:结果不为空时通过
        var pass_condition = api['pass_condition'];
        const loop_behaviour = api['sub_api_loop_behaviour'];
        const sub_api_batch_behaviour = api['sub_api_batch_behaviour'];
        const call_interface_behaviour = api['call_interface_behaviour'];
        middleResArr[subApiInx] = {};

        // Start to check and apply skipping conditions sequentially
        // Current request is "ask - or", while previous request made "flag" true, so skip current request
        // 本次为「ask - or」请求，且前一次请求已将 flag 置 true，因此跳过本次请求
        if (sub_api_type == extend_constant.sub_api_type.ask && sub_api_related_type == extend_constant.sub_api_related_type.or && flag == true) {
            subApiInx++;
            continue;
        }

        if (ask_do_flag === false) {
            subApiInx++;
            ask_do_flag = true;
            continue;
        }

        // When ask_ifelse_exec has a state
        // 当 Ask_ifelse_exec 有状态，进入判断流程
        if (ask_ifelse_exec !== null) {
            // false, so skip current request
            if (ask_ifelse_exec === false) {
                /*
                 * types allowed:
                 * - do
                 * - do_batch
                 * - ask
                 * - ask_batch
                 */
                if (sub_api_type === extend_constant.sub_api_type.do
                    || sub_api_type === extend_constant.sub_api_type.do_batch
                    || sub_api_type === extend_constant.sub_api_type.ask
                    || sub_api_type === extend_constant.sub_api_type.ask_batch) {
                    // clear the state
                    ask_ifelse_exec = null;
                    // and skip the request
                    subApiInx++;
                    continue;
                }
                else {
                    throw {type: 'unexpected_subapi_type', detail: '<' + sub_api_type + '> type not allowed here', url: sub_uri};
                }
            }
            // true, so make current request and skip next
            else if (ask_ifelse_exec === true) {
                /*
                 * types allowed:
                 * - do
                 * - do_batch
                 * - ask
                 * - ask_batch
                 */
                if (sub_api_type === extend_constant.sub_api_type.do
                    || sub_api_type === extend_constant.sub_api_type.do_batch
                    || sub_api_type === extend_constant.sub_api_type.ask
                    || sub_api_type === extend_constant.sub_api_type.ask_batch) {
                    // mark the next request bear an "ask_ifelse_exec" state as false
                    ask_ifelse_exec = false;
                }
                else {
                    throw {type: 'unexpected_subapi_type', detail: '<' + sub_api_type + '> type not allowed here', url: sub_uri};
                }
            }
            // in case of a polluted ask_ifelse_exec's value, e.g. some one gives it a value "42"
            else {
                // stop the whole process to prevent bad consequences due to a polluted if-else state
                throw {type: 'ask_ifelse_error', detail: 'Unrecognized ask_ifelse_exec state <' + ask_ifelse_exec + '>', url: sub_uri};
            }
        }

        //for analysis api
        if(url_source === URL_SOURCE_ANALYSIS && !sub_uri.match(url_pattern)){
            sub_uri = analysis_server_url + sub_uri;
        }

        // PREPROCESSING
        // if not started with http:// or https:// then attach the baas internal domain/IP address
        if (!sub_uri.match(url_pattern)) sub_uri = host + sub_uri;

        // 兼容老数据,默认不为空时通过
        if (util.isUndefined(pass_condition)) pass_condition = 1;

        try { error_ret = JSON.parse(error_ret); } catch (e) { }
        let body = JSON.parse(JSON.stringify(req.body));

        // prepare, parse, and validate parameters
        user_params = extend_constant.build_user_params(user_params, body);
        if (-1 == user_params.status) {
            throw {type: 'miss_params', detail: user_params.name, url: sub_uri};
        }


        let params;

        // building find_batch, ask_batch or do_batch request objects
        if (sub_api_type === extend_constant.sub_api_type.ask_batch
            || sub_api_type === extend_constant.sub_api_type.do_batch
            || sub_api_type === extend_constant.sub_api_type.find_batch) {
            // If "iterator" is a json path
            if (typeof loopPath === 'undefined' || loopPath.toString().length === 0) throw {type: 'miss_params', detail: 'loop_item param is not set or is empty', url: sub_uri};

            // extract iterate object by "__middle_result" and process thru custom functions
            let realPath;
            if (loopPath.indexOf('__middle_result') >= 0) {
                realPath = lodash.get(middleResArr, loopPath.replace('__middle_result', ''));
                if (realPath == undefined) throw {type: '__loop_item_error', detail: `__loop_item ${loopPath} not found`, url: sub_uri};
            }
            else {
                realPath = loopPath;
            }

            // replace user params inside loopPath
            let iterateArr;
            try {
                iterateArr = extend_constant.build_default_params({realPath: realPath}, user_params).realPath;
            } catch (e) {
                handle_expression_error(e,sub_uri);
                throw {type: 'miss_params', detail: '', url: sub_uri};
            }

            // init and build batchApi array

            if (!Array.isArray(iterateArr)) iterateArr = [iterateArr];

            if(iterateArr.length === 0 || iterateArr[0] === undefined){
                if(sub_api_type === 'find_batch') {
                    let no_data_result_obj = {'result':{}};
                    no_data_result_obj.result[findBatchReturnKey] = [];

                    Object.assign(resultObj,no_data_result_obj);
                }else{
                    Object.assign(resultObj,[]);
                }

                Object.assign(lastBodyCache,[]);
                subApiInx++;
                continue;
            }

            await iterateArr.forEach(async function (iterateObj) {
                var apiObj = {};
                apiObj['method'] = api['method'];
                apiObj['sub_uri'] = api['sub_uri'];
                apiObj['sub_api_type'] = (sub_api_type === extend_constant.sub_api_type.ask_batch) ? 'ask' : 'do';
                apiObj['sub_api_related_type'] = api['sub_api_related_type'];
                apiObj['loopPath'] = api['sub_api_loop_item'];

                if (sub_api_type === 'find_batch') {
                    apiObj['sub_api_loop_item_import_key'] = api['sub_api_loop_item_import_key'];
                    apiObj['find_batch_result_key'] = api['find_batch_result_key'];

                    if (util.isUndefined(api['find_batch_return_key']) || api['find_batch_return_key'] === '') {
                        apiObj['find_batch_return_key'] = 'default-list';
                    }
                    else {
                        apiObj['find_batch_return_key'] = api['find_batch_return_key'];
                    }

                    apiObj['find_batch_total_count'] = api['find_batch_total_count'];
                    willUseFindBatch = true;
                }

                apiObj['error_ret'] = api['error_ret'];
                apiObj['default_params'] = {}; // built_params now is filled with user params input, and __loop_item to be handled in the following lines
                apiObj['user_params'] = []; // no need to pass user params in, as values are already filled
                apiObj['sort_by'] = api['sort_by'];
                apiObj['limit'] = api['limit'];
                apiObj['pass_condition'] = api['pass_condition'];
                // hookMsg, middle_result, loop_item, user_params, concat, middleResArr = [], inside
                // replace default params for "__loop_item"
                // the last param sets "inside" to "true", which will invoke the "__loop_item" replacement
                let valueExtractor = {value: null};
                let var_solved_params = handle_user_params({}, {}, iterateObj, default_params, false, middleResArr, true, valueExtractor);

                if (sub_api_type === 'find_batch') {
                    apiObj['import_key_content'] = iterateObj;
                }

                let built_params;
                try {
                    built_params = extend_constant.build_default_params(var_solved_params, user_params);
                } catch (e) {
                    handle_expression_error(e,sub_uri);
                    throw {type: 'miss_params', detail: '', url: sub_uri};
                }

                // drop empty "$$" variables for find.json apis
                if(is_need_remove_condtions(apiObj['sub_uri'])){
                    built_params = extend_constant.handle_object(built_params);
                }

                apiObj['default_params'] = extend_constant.merge_params(built_params,apiObj['sort_by'],apiObj['limit']);

                if (apiObj['default_params'] === null) throw {type: 'param_replace_error', detail: '', url: sub_uri};

                if (sub_api_type === 'find_batch' && findBatchTotalCount === true) {

                    if(!apiObj['default_params']['output_filter'])
                    {
                        apiObj['default_params']['output_filter'] = {};
                    }
                    let max_chaix_index =  get_output_filter_max_chaix_index(apiObj['default_params']['output_filter'],0);

                    if(typeof apiObj['default_params']['output_filter']["__counter"] != 'undefined'){

                        let total_count_obj;
                        for(let __counter_item of apiObj['default_params']['output_filter']["__counter"] ){

                            if(__counter_item['total_count']){

                                total_count_obj = __counter_item;
                                break;
                            }
                        }
                        if(!total_count_obj){

                            max_chaix_index ++;
                            apiObj['default_params']['output_filter']["__counter"].push({"total_count":[{"result_key":"total_count","result_field_explain":"","chain_index":max_chaix_index}]});

                        }

                    }else {

                        max_chaix_index ++;
                        apiObj['default_params']['output_filter']["__counter"] = [{"total_count":[{"result_key":"total_count","result_field_explain":"","chain_index":max_chaix_index}]}];
                    }

                }

                // add to batch api
                batchApi.push(apiObj);
            });
        }else{

            let var_solved_params = handle_user_params({}, lastBodyCache, {}, default_params, false, middleResArr, false);
            if (var_solved_params === null) throw {type: 'param_replace_error', detail: '', url: sub_uri};
            try {
                var built_params = extend_constant.build_default_params(var_solved_params, user_params);
            } catch (e) {
                handle_expression_error(e,sub_uri);
                throw {type: 'miss_params', detail: '', url: sub_uri};
            }

            if(is_need_remove_condtions(sub_uri)){
                built_params = extend_constant.handle_object(built_params);
            }

            params = extend_constant.merge_params(built_params, sort_by, limit);
            debug_logger.debug('params=');
            debug_logger.debug(params);
        }

        // MAKING REQUEST
        if (Array.isArray(batchApi) && batchApi.length > 0) {
            // batch request
            try {

                if(sub_api_type === extend_constant.sub_api_type.do_batch && loop_behaviour === 'ignore_error'){

                    //异步调用,直接返回结果
                    if(call_interface_behaviour === CALL_INTERFACE_BEHAVIOUR_ASYNC){
                        const async_request_result = {'error_code': 0};
                        if(sub_api_batch_behaviour === BATCH_BEHAVIOUR_SERIAL){
                            makeProOpRequest(req, response, batchApi, {}, willUseFindBatch,lastReqBody,{'middleResArr': null},IGNORE_DO_BATCH_ERROR);
                        }else{
                            Promise.map(batchApi,async function(single_api){
                                await makeProOpRequest(req, response, single_api, {}, willUseFindBatch,lastReqBody,{'middleResArr': null},IGNORE_DO_BATCH_ERROR);
                            });
                        }
                        // reset
                        batchApi = [];
                        Object.assign(lastBodyCache, async_request_result);
                        middleResArr[subApiInx] = async_request_result;
                        continue;
                    }else{
                        //同步调用
                        if(sub_api_batch_behaviour === BATCH_BEHAVIOUR_SERIAL){
                            await makeProOpRequest(req, response, batchApi, resultObj, willUseFindBatch,lastReqBody,{'middleResArr': null},IGNORE_DO_BATCH_ERROR);
                        }else{
                            await Promise.map(batchApi,async function(single_api){
                                await makeProOpRequest(req, response, single_api, resultObj, willUseFindBatch,lastReqBody,{'middleResArr': null},IGNORE_DO_BATCH_ERROR);
                            });
                        }
                    }
                }else if(sub_api_type === extend_constant.sub_api_type.find_batch){
                    let resultObjs =  await Promise.map(batchApi,async function(single_api){

                        let single_resultObj = {};
                        await makeProOpRequest(req, response, single_api, single_resultObj, willUseFindBatch,lastReqBody,{'middleResArr': null},NOT_IGNORE_DO_BATCH_ERROR);
                        return single_resultObj;

                    });

                    for (let key in resultObj) {

                        if (resultObj.hasOwnProperty(key) && key !== 'isFirstRound') {
                            delete resultObj[key];
                        }
                    }
                    resultObj.result = {};
                    resultObj.result[findBatchReturnKey] = resultObjs;
                }else{
                    //异步调用,直接返回结果
                    if(call_interface_behaviour === CALL_INTERFACE_BEHAVIOUR_ASYNC){
                        const async_request_result = {'error_code': 0};
                        if(sub_api_batch_behaviour === BATCH_BEHAVIOUR_SERIAL){
                            makeProOpRequest(req, response, batchApi, {}, willUseFindBatch,lastReqBody,{'middleResArr': null},NOT_IGNORE_DO_BATCH_ERROR);
                        }else{
                            Promise.map(batchApi,async function(single_api){
                                await makeProOpRequest(req, response, single_api, {}, willUseFindBatch,lastReqBody,{'middleResArr': null},NOT_IGNORE_DO_BATCH_ERROR);
                            });
                        }
                        // reset
                        batchApi = [];
                        Object.assign(lastBodyCache, async_request_result);
                        middleResArr[subApiInx] = async_request_result;
                        continue;
                    }else{
                        if(sub_api_batch_behaviour === BATCH_BEHAVIOUR_SERIAL){
                            await makeProOpRequest(req, response, batchApi, resultObj, willUseFindBatch,lastReqBody,{'middleResArr': null},NOT_IGNORE_DO_BATCH_ERROR);
                        }else{
                            await Promise.map(batchApi,async function(single_api){
                                await makeProOpRequest(req, response, single_api, resultObj, willUseFindBatch,lastReqBody,{'middleResArr': null},NOT_IGNORE_DO_BATCH_ERROR);
                            });
                        }
                    }

                }

                if(sub_api_type === extend_constant.sub_api_type.find_batch){

                    if(loopPath.indexOf('__middle_result') > -1){

                        const reg = /\[[\d]+\]/ig

                        if(loopPath.match(reg).length > 0){

                            let middle_result = lodash.get(middleResArr,loopPath.match(reg)[0])
                            if(middle_result){

                                if(middle_result['total_count']){

                                    resultObj.result['total_count'] = middle_result['total_count'];
                                }else if(middle_result['result'] && middle_result['result']['total_count']){

                                    resultObj.result['total_count'] = middle_result['result']['total_count'];

                                }
                            }
                        }
                    }else if(loopPath.indexOf('__re_middle_result') > -1){

                        if(subApiInx - 1 > 0){

                            let middle_result = middleResArr[subApiInx - 1];

                            if(middle_result['total_count']){

                                resultObj.result['total_count'] = middle_result['total_count'];
                            }else if(middle_result['result'] && middle_result['result']['total_count']){

                                resultObj.result['total_count'] = middle_result['result']['total_count'];

                            }
                        }

                    }
                }
                middleResArr[subApiInx] = (resultObj === null)?{}:resultObj;
                // reset
                batchApi = [];

                // increse the sub api index immediately, since a batch request finishes execution and jumps from this "if" block directly to the next iteration, making the "subApiInx++" on the last line unreachable
                subApiInx++;
                continue;
            }
            catch (err) {
                throw err;
            }
        }
        else {

            debug_logger.debug('Making normal request to <' + sub_uri + '>');
            
            var result;

            let sub_uri_arr = [host + '/util/file/upload.json', host + '/util/excel/import.json'];
            if (!util.isUndefined(req.files) && sub_uri_arr.indexOf(sub_uri) !== -1) {

                let file_path = tmp_file_path(req);
                let formData;

                if (params['file']) {
                    formData = {
                        'file': fs.createReadStream(file_path)
                    };
                } else if (params['pic']) {
                    formData = {
                        'pic': fs.createReadStream(file_path)
                    };
                } else {

                }

                let parasm_keys = Object.keys(params);
                for (let i of parasm_keys) {
                    if (typeof params[i] === 'object') {
                        params[i] = JSON.stringify(params[i]);
                    }
                }

                params = lodash.merge(params, formData);
                lastReqBody.body = params;

                let reqObj = {
                    uri: sub_uri,
                    method: 'POST',
                    formData: params,
                    json: true
                };

                reqObj = set_main_url_param_to_reqObj(reqObj, req);
                result = syncRequestForMultiPart(reqObj)
            }else if (sub_uri === host + '/util/excel/export.json') {
                let reqObj = {
                    uri: sub_uri,
                    body: params
                };
                reqObj = set_main_url_param_to_reqObj(reqObj, req);
                result = syncRequestForStream(reqObj, response);

                //如果是导出接口,必须是最后一个接口.
                continue;
            } else {
                let reqObj = {
                    uri: sub_uri,
                    body: params,
                    method: method,
                    content_type: content_type
                };

                lastReqBody.body = params;
                reqObj = set_main_url_param_to_reqObj(reqObj, req);
                reqObj = set_source_ip_param_to_reqObj(reqObj,req);

                if(call_interface_behaviour === CALL_INTERFACE_BEHAVIOUR_ASYNC){
                    const async_request_result = {'error_code': 0};
                    asyncRequest(reqObj);
                    Object.assign(lastBodyCache, async_request_result);
                    middleResArr[subApiInx] = async_request_result;
                    continue;
                }else{
                    result = await syncRequest(reqObj);
                }
            }
        }

        // POST PROCESSING
        if (result.err !== null) {
            // error handling
            throw result.err;
            // end of error handling
        }
        else if (result.res !== null) {
            // result handling
            let res = result.res;

            middleResArr[subApiInx] = (res == null)?{}:res;

            //这是一个补丁程序,需要删除和result平级的空not_updated
            if(Array.isArray(res['not_updated']) && res['not_updated'].length === 0) delete res['not_updated'];

            // find_batch result builder
            if (isFindBatch === true) {
                // if (resultObj.isFirstRound === true) {
                //     for (let key in resultObj) {
                //         if (resultObj.hasOwnProperty(key) && key !== 'isFirstRound') {
                //             delete resultObj[key];
                //         }
                //     }
                //
                //     // chagned to an object at 20170309
                //     resultObj.result = {};
                //
                //     resultObj.result[findBatchReturnKey] = [];
                //     resultObj.isFirstRound = false;
                // }
                //
                // if (resultObj.hasOwnProperty('result') && Array.isArray(resultObj.result[findBatchReturnKey])) {
                //     if (typeof importKey === 'string' && importKey.length > 0) {
                //         res[importKey] = importKeyContent;
                //     }
                //
                //     res[findBatchResultKey] = res.result;
                //     delete res.result;
                //     delete res.error_code;
                //
                //     resultObj.result[findBatchReturnKey].push(res);
                // }
                // else {

                    if(typeof importKey == 'string' && importKey.length >0){
                        res[importKey] = importKeyContent;
                    }
                    res[findBatchResultKey] = res.result;
                    delete res.result;
                    delete res.error_code;
                    // resultObj = Object.assign(resultObj,{error_code: 0});
                    // resultObj.result = [];
                   // resultObj.result.push(res);
                    Object.assign(resultObj,res)
              //  }
            }
            else {
                let keys_resultObj = Object.keys(resultObj);

                for(let i of keys_resultObj){
                    if (i === 'isFirstRound') continue;
                    delete resultObj[i];
                }

                Object.assign(resultObj,res);
            }

            var resultStatus = 0;

            if(!res){
                throw {type: 'res is undefined',detail: res,url: sub_uri};
            }

            if (!util.isUndefined(res.error_code) && res.error_code > 0) {
                //当do_batch忽略子接口执行错误时,还要继续遍历执行其它sub_api,但仅对接口返回的error_code > 0 有效,其它错误仍旧会终止执行
                if(ignore_do_batch_error !== IGNORE_DO_BATCH_ERROR){
                    error_ret = res;
                    throw {type: 'error_code_above_zero', detail: res, url: sub_uri};
                }
            }
            else if (res.result) {
                if (Array.isArray(res.result)) {
                    resultStatus = res.result.length;
                }
                else if (typeof res.result === 'object') {
                    resultStatus = Object.keys(res.result).length;
                }
            }


            if(subApi[sub_i - 1] && subApi[sub_i - 1]['sub_api_type'] === 'ask_do' && subApi[sub_i - 1]['sub_api_ask_do_break'] === 'break'){
                sub_i = subApi.length;
                continue;
            }

            if (sub_api_type === extend_constant.sub_api_type.ask) {
                // 不通过的情况
                // 1.结果为空,判断条件结果为空不通过
                // 2.结果不为空,判断条件结果为空通过
                if ((resultStatus <= 0 && pass_condition == 1) || (resultStatus >= 1 && pass_condition == 0)) {
                    flag = false;
                    if (sub_api_related_type === extend_constant.sub_api_related_type.or) {
                        // no error, pass on to next url request
                        Object.assign(lastBodyCache, res);
                    }
                    else {
                        throw {type: 'ask_not_pass', detail: error_ret, url: sub_uri};
                    }
                }
                else {
                    flag = true;
                    // no error, pass on to next url request
                    Object.assign(lastBodyCache, res);
                }
            }
            else if (sub_api_type === extend_constant.sub_api_type.ask_ifelse) {
                // same criteria as above "ask"
                if ((resultStatus <= 0 && pass_condition == 1) || (resultStatus >= 1 && pass_condition == 0)) {
                    // no pass, tell the next sub api to skip
                    ask_ifelse_exec = false;
                }
                else {
                    // pass, tell the next sub api to exec
                    ask_ifelse_exec = true;
                }

                Object.assign(lastBodyCache, res);
            }
            else if (sub_api_type === extend_constant.sub_api_type.do) {
                if (flag === false) {
                    throw {type: 'ask_not_pass', detail: error_ret, url: sub_uri};
                }
                else {
                    // no error, pass on to next url request
                    Object.assign(lastBodyCache, res);
                }
            }
            else if (sub_api_type === extend_constant.sub_api_type.ask_do) {
                // same criteria as above "ask"
                if ((resultStatus <= 0 && pass_condition == 1) || (resultStatus >= 1 && pass_condition == 0)) {
                    // no pass, tell the next sub api to skip
                    ask_do_flag = false;
                }
                else {
                    // pass, tell the next sub api to exec
                    ask_do_flag = true;
                }

                Object.assign(lastBodyCache, res);
            }
            // end of result handling
        }
        else {

        }

        subApiInx++;
    }
}




let tmp_file_path = deasync(function(req,done) {
    
    Keygen.issue(function (key) {
        
        let file_name = Object.keys(req.files)[0];
        let file      = req.files[file_name];
        let file_extname = file.name || "";
        let extname = path.extname(file_extname);
        
        get_temp_file_unique_path(key + extname,function (err,file_path) {
            if(err) logger.error('get_temp_file_unique_path error,e = '  + err.message);
            file.mv(file_path,function (err) {
                if(err){
                    logger.error('file mv error,e = '  + err.message);
                }
                
                done(null,file_path);
            });
        });
        
        
    });
});

let syncRequest = async function (reqObj) {
    // error checking
    if (typeof reqObj.uri === 'undefined' || reqObj.uri.toString().length === 0) done('syncRequest() need a url to proceed.');
    
    // set default value
    if (typeof reqObj.method === 'undefined') reqObj.method = 'POST';
    if (typeof reqObj.timeout === 'undefined') reqObj.timeout = 15000;

    if (reqObj.method === 'post' || reqObj.method === 'POST') {
        if (typeof reqObj.body !== 'undefined' && reqObj.body instanceof Object) {
            reqObj['json'] = true;
        }

        // 自定义请求类型标识，content_type 规定请求体类型
        if (typeof reqObj.content_type === 'string') {
            switch (reqObj.content_type) {
                case 'form':
                    if (typeof reqObj.body === 'string') {
                        reqObj.form = reqObj.body
                    } else {
                        reqObj.form = Object.assign({}, reqObj.body)
                    }
                    delete reqObj.body
                    break
                default:
                    break
            }

            delete reqObj.req_type
        }
    } else if (reqObj.method === 'get' || reqObj.method === 'GET') {
        if (reqObj.body instanceof Object) {
            reqObj.qs = Object.assign({}, reqObj.body)
            delete reqObj.body
        }
    }

    const pathname = url.parse(reqObj.uri).pathname;
    const data_name = get_data_name(pathname);
    if(get_inner_function(pathname) !== null){

        reqObj = convert_reqObj_to_http_req(reqObj);
        try{

            let res = await get_inner_function(pathname)(reqObj.body,data_name);

            sync_call_interface_logger(reqObj,res);
            return {err: null, res: res};
        }catch (err){
            sync_call_interface_logger(reqObj,err,true);
            logger.error('syncRequset get err = ');
            logger.error(err);
            return {err:err,res:null};
        }
    }else{

        reqObj = set_main_url_param_to_request_headers(reqObj);
        reqObj = set_source_ip_to_request_headers(reqObj);

        return await request(reqObj)
            .then(res => {

                //当调用第三方接口时,res可能出现为undefined,需处理
                if(res === undefined || res === null){
                    res = {
                        'result': {},
                        'error_code': 0
                    }
                }
                return {err: null, res: res};
            })
            .catch(err => {
                logger.error('syncRequset get err = ');
                logger.error(err);
                return {err:err,res:null};
            });
    }
};


let asyncRequest = async function (reqObj) {
    // set default value
    if (typeof reqObj.method === 'undefined') reqObj.method = 'POST';
    if (typeof reqObj.timeout === 'undefined') reqObj.timeout = 15000;

    if (reqObj.method === 'post' || reqObj.method === 'POST') {
        if (typeof reqObj.body !== 'undefined' && reqObj.body instanceof Object) {
            reqObj['json'] = true;
        }

        // 自定义请求类型标识，content_type 规定请求体类型
        if (typeof reqObj.content_type !== 'string' && reqObj) {
            switch (reqObj.content_type) {
                case 'form':
                    if (typeof reqObj.body === 'string') {
                        reqObj.form = reqObj.body
                    } else {
                        reqObj.form = Object.assign({}, reqObj.body)
                    }
                    delete reqObj.body
                    break
                default:
                    break
            }

            delete reqObj.req_type
        }
    } else if (reqObj.method === 'get' || reqObj.method === 'GET') {
        if (reqObj.body instanceof Object) {
            reqObj.qs = Object.assign({}, reqObj.body)
            delete reqObj.body
        }
    }

    const pathname = url.parse(reqObj.uri).pathname;
    const data_name = get_data_name(pathname);
    if(get_inner_function(pathname) !== null){

        reqObj = convert_reqObj_to_http_req(reqObj);
        try{

            let res = await get_inner_function(pathname)(reqObj.body,data_name);
            logger.info(`async_call url = ${reqObj.uri} | body = ${JSON.stringify(reqObj.body)} | result = ${JSON.stringify(res)}`);
            sync_call_interface_logger(reqObj,res);
        }catch (err){
            sync_call_interface_logger(reqObj,err,true);
            logger.error(`async_call url = ${reqObj.uri} | body = ${JSON.stringify(reqObj.body)} | err = `);
            logger.error(err);
        }
    }else{

        reqObj = set_main_url_param_to_request_headers(reqObj);
        reqObj = set_source_ip_to_request_headers(reqObj);

        return await request(reqObj)
            .then(res => {
                logger.info(`async_call url = ${reqObj.uri} | body = ${JSON.stringify(reqObj.body)} | result = ${JSON.stringify(res)}`);
                //当调用第三方接口时,res可能出现为undefined,需处理
                if(res === undefined || res === null){
                    res = {
                        'result': {},
                        'error_code': 0
                    }
                }
            })
            .catch(err => {
                logger.error(`async_call url = ${reqObj.uri} | body = ${JSON.stringify(reqObj.body)} | err = `);
                logger.error(err);
            });
    }
};

let syncRequestForMultiPart = deasync(function (reqObj, done) {
    // error checking
    if (typeof reqObj.uri === 'undefined' || reqObj.uri.toString().length === 0) done('syncRequest() need a url to proceed.');
    
    if (typeof reqObj.timeout === 'undefined') reqObj.timeout = 60000;
    
    reqObj = set_main_url_param_to_request_headers(reqObj);
    
    request(reqObj)
        .then(res => {
            done(null, {err: null, res: res});
        })
        .catch(err => {
            done(null, {err: err, res: null});
        });
});

let syncRequestForStream = deasync(function (reqObj,response, done) {
    let body = reqObj.body;
    let keys = Object.keys(body);
    for(let key of keys){
        if(Array.isArray(body[key])){
            if(isJson(body[key])){
                for(let i of body[key]){
                    body[key][i] = JSON.stringify(body[key][i]);
                }
            }
            body[key] = JSON.stringify(body[key]);
        }else if(isJson(body[key])){
            body[key] = JSON.stringify(body[key]);
        }
    }
    
    let postData    = querystring.stringify(body);
    let url_parse   = url.parse(reqObj.uri);
    
    let options = {
        hostname: url_parse['hostname'],
        port: url_parse['port'],
        path: url_parse['path'],
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    
    options = set_main_url_param_to_request_headers(options,true,reqObj);
    let req = http.request(options,function (res) {
        let excel_file_name = new Buffer(res.headers['export_excel_file_name'],'base64').toString('utf8');
        response.setHeader('Content-Type','application/octet-stream');
        response.setHeader('Content-Disposition', 'attachment; filename=' + new Buffer(excel_file_name).toString('binary'));
        res.on('data',chunk => {
            response.write(chunk);
        });
        
        res.on('end',() => {
            response.send();
        });
        
        //done(null,{err:null,res:null});
    });
    
    req.on('error',e => {
        logger.error('syncRequestForStream req error,e = ' + e.message);
    });
    
    req.write(postData);
    req.end();
});
//variables __re_msg_result.result.id
//value_string {"name":"__re_msg.result.id"}
//identifier __re_msg
//data_source Data
function processReVariables (variables, value_string, identifier, data_source, valueExtractor) {
    variables.forEach(variable => {
        
        if (variable === identifier) {
            value_string = value_string.replace(identifier, data_source);
        }
        else {
            let path = variable.replace(identifier, ''); // trim "__re_msg" itself
            path = path.replace(/^\./, ''); // trim the leading dot, like in ".result.data.xxx", while keeping path like "[0].result.data.xxx"
            let value = lodash.get(data_source, path); // using lodash to retrive a nested value via a string
            
            if (value == undefined) {
                logger.debug('Param replace error, use empty string as value. Path not found at: ' + variable);
                value_string = value_string.replace(variable, '');
                
                // to extract value for find_batch loop item import key
                if (typeof valueExtractor === 'object' && valueExtractor.hasOwnProperty('value')) {
                    valueExtractor.value = '';
                }
            }
            else {
                value_string = extend_constant.build_processReVariables(value_string,value,variable,identifier);
                
                // to extract value for find_batch loop item import key
                if (typeof valueExtractor === 'object' && valueExtractor.hasOwnProperty('value')) {
                    valueExtractor.value = '';
                }
                
                /*
                 如果value_string变成了一个object,则它需要再变为一个string,要满足同时出时__middle_result和__loop_item的情况,如果它是一个object,则不会检测到__loop_item
                 */
                if(typeof value_string === 'object'){
                    value_string = JSON.stringify(value_string);
                }

            }
        }
    });

    return value_string;
}

/*
 * This method replaces "__re" variables with real data
 *
 * Param    user_params         Array of objects
 *
 * Return   processed_params    Object with all keys concatenated
 */
function handle_user_params (hookMsg, middle_result, loop_item, user_params, concat, middleResArr = [], inside, valueExtractor) {
    if (util.isUndefined(concat) || concat == null) {
        concat = true;
    } // when concat is true, every keys in every objects will be put into a single object. otherwise the keys remain in their own objects as the same as in the original array
    
    if (util.isUndefined(inside) || inside == null) {
        inside = false;
    } // when insider is true, will replace "__loop_item" variable, since this is only served for inside the ask-batch / do-batch / find-batch
    
    if (util.isUndefined(user_params) || user_params == null || user_params == {}) {
        logger.debug('The user_params is empty. Calling back with an empty object.');
        return {};
    }

    if (!Array.isArray(user_params)) {
        user_params = [user_params];
    }
    var processedParams = {};
    var processedArrayOfParams = [];
    
    for (var i = 0; i < user_params.length; i++) {
        var param = user_params[i];
        var keys = Object.keys(param);

        for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            var value_string = param[key]; // might be an object
            var was_object = false;
            
            if (typeof value_string == 'object') {
                value_string = JSON.stringify(value_string); // if it is an object, stringify it
                was_object = true;
            }
            var re, variables, variable;
            if (typeof value_string == 'string' && value_string.indexOf('__re_msg') >= 0) {
                re = /__re_msg\.[\w_\-.\[\]]+/gi;
                variables = value_string.match(re); // match and extract all variables
                try {
                    value_string = processReVariables(variables, value_string, '__re_msg', hookMsg, valueExtractor);
                }
                catch (e) {
                    logger.error(e.toString());
                    return null;
                }
            }
            
            if (typeof value_string == 'string' && value_string.match(/__re_middle_result\./gi) != null) {
                re = /__re_middle_result\.[\w_\-.\[\]]+/gi;
                variables = value_string.match(re); // match and extract all variables
                try {
                    value_string = processReVariables(variables, value_string, '__re_middle_result', middle_result, valueExtractor);
                }
                catch (e) {
                    logger.error(e.toString());
                    return null;
                }
            }
            if (typeof value_string == 'string' && value_string.indexOf('__middle_result') >= 0) {
                re = /__middle_result(\[[\d]+\])?(\.[\w_\-.\[\]]+)?/gi; // this regex pattern is more flexible than its siblings here, todo: adapt the siblings to this pattern to support more flexible usage
                variables = value_string.match(re); // match and extract all variables
                value_string = processReVariables(variables, value_string, '__middle_result', middleResArr, valueExtractor);
            }
            
            if (typeof value_string == 'string' && value_string.indexOf('__re_loop_item') >= 0) {
                re = /__re_loop_item\.[\w_\-.\[\]]+/gi;
                variables = value_string.match(re); // match and extract all variables
                
                try {
                    value_string = processReVariables(variables, value_string, '__re_loop_item', loop_item, valueExtractor);
                }
                catch (e) {
                    logger.error(e.toString());
                    return null;
                }
            }
            
            if (inside === true && typeof value_string == 'string' && value_string.indexOf('__loop_item') >= 0) {
                re = /__loop_item\.[\w_\-.\[\]]+/gi;
                variables = value_string.match(re); // match and extract all variables
                
                if (variables === null) {
                    // second try for sole identifier usage
                    re = /__loop_item$/gi;
                    variables = '__loop_item'.match(re);
                }
                
                try {
                    value_string = processReVariables(variables, value_string, '__loop_item', loop_item, valueExtractor);
                }
                catch (e) {
                    logger.error(e.toString());
                    return null;
                }
            }
            
            processedParams[key] = value_string;
            // if (was_object) {
            //     processedParams[key] = JSON.parse(processedParams[key]);
            // } // if it was an object, restore its structure from string
            try{
                processedParams[key] = JSON.parse(processedParams[key]);
            }catch (e){
                
            }
        }
        
        processedArrayOfParams.push(processedParams);
        if (!concat) {
            processedParams = {};
        } // reset if no concatenating needed
    }

    if (!concat) {
        return processedArrayOfParams;
    }
    else {
        return processedParams;
    }
}

function handle_expression_error(err,sub_uri) {
    let error_msg = null;
    try{
        error_msg = JSON.parse(err.message);
    }catch (e){
        logger.error('handle_expression_error parse err.message fail.message = ' + JSON.stringify(err.message));
    }
    
    if(error_msg !== null && typeof error_msg === 'object' && error_msg.error_code){
        throw {type: EXPRESSION_ERROR_TYPE, detail: JSON.stringify(error_msg),url: sub_uri};
    }
}

function set_main_url_param_to_reqObj(reqObj,req) {
    reqObj.main_url = req.url;
    
    return reqObj;
}

function set_source_ip_param_to_reqObj(reqObj,req) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (typeof ip === 'string' && ip.substr(0, 7) == "::ffff:") {
        ip = ip.substr(7)
    }
    reqObj.source_ip = ip;

    return reqObj;
}

function set_main_url_param_to_request_headers(reqObj,is_real_reqObj,reqObj_real) {
    if(!reqObj.headers) reqObj.headers = {};
    
    let main_url = reqObj.main_url;
    if(is_real_reqObj === true) main_url = reqObj_real.main_url;
    
    reqObj.headers[MAIN_URL_IN_HEADER_NAME] = main_url;

    delete reqObj.main_url;
    return reqObj;
}

function set_source_ip_to_request_headers(reqObj) {
    if(!reqObj.headers) reqObj.headers = {};


    reqObj.headers[SOURCE_IP_IN_HEADER_NAME] = reqObj.source_ip;
    reqObj.headers['x-forwarded-for'] = reqObj.source_ip;

    delete reqObj.source_ip;
    return reqObj;
}

function handle_result_erase_hierarchy(erase_paths,resultObj) { // 处理返回数据层级拉伸

    try{
        for(let paths of erase_paths){

            if(paths.hasOwnProperty('path') && paths.hasOwnProperty('keep_array'))

                handle_result_one_path_erase_hierarchy(paths.path,paths.keep_array,resultObj);

        }

    }catch (e){


        logger.error(`handle_result_erase_hierarchy ${e.message}`)
        throw  e;
    }


}

function handle_result_one_path_erase_hierarchy(path,keep_array,resultObj) { // 处理一个路径的水平拉伸

    try {


        if(lodash.has(resultObj,path)){

            let resource = lodash.get(resultObj,path);

            if(Array.isArray(resource)){
                let result_arr = [];
                for(let value of resource){

                    result_arr.push(handle_erase_hierarchy_resource_property(value,keep_array,{},''));
                }

                lodash.set(resultObj,path,result_arr);

            }else if(typeof resource === 'object'){

                let result_obj = handle_erase_hierarchy_resource_property(resource,keep_array,{},'')

                lodash.set(resultObj,path,result_obj);
            }
        }else {

        }

    }catch (e){

        logger.error(`handle_result_one_path_erase_hierarchy ${e.message} `);

        throw  e;
    }


}

// 递归遍历 层级拉伸没一项object 的属性
function handle_erase_hierarchy_resource_property(resource,keep_array,result,key_name) {

    try{

        let cancel_prefix_arr = ['data','user_data','op_data'];
        let keys = Object.keys(resource);

        for (let key_index of keys){

            let value_object = resource[key_index];

            if(Array.isArray(value_object)){

                if(parseInt(keep_array) == 0){ // 数组层级拉伸

                    if(value_object.length > 0){

                        if(typeof value_object[0] == 'object'){

                            let  temp_key_name = key_name + key_index + "_";
                            handle_erase_hierarchy_resource_property(value_object[0],keep_array,result,temp_key_name)
                        }else {

                            let  temp_key_name  = key_name + key_index;
                            result[temp_key_name] = value_object;
                        }

                    }

                }else if(parseInt(keep_array) == 1){ // 数组层级不拉伸

                    let path = key_name + key_index;
                    let temparr = [];

                    _.set(result,path,temparr);

                    for(let obj of value_object){

                        if(typeof obj === 'object'){
                            let temp_result = {};

                            temparr.push(handle_erase_hierarchy_resource_property(obj,keep_array,temp_result,''));

                        }else {
                            temparr.push(obj);

                        }
                    }

                }

            }else if(typeof value_object == 'object' && value_object != null){

                let temp_key_name = cancel_prefix_arr.indexOf(key_index) > -1 ? key_name : key_name + key_index + "_";

                handle_erase_hierarchy_resource_property(value_object,keep_array,result,temp_key_name);
            }else {

                let  temp_key_name  = key_name + key_index;
                result[temp_key_name] = value_object;
            }
        }
        return result;


    }catch (e){

        logger.error(`handle_erase_hierarchy_resource_property ${e.message} `);


        throw e;
    }

}

// 获取get_output_filter 最大的chaix_index
function get_output_filter_max_chaix_index(obj,max_chaix_index) {

    let keys = Object.keys(obj);

    for(let key of keys) {

        let value = obj[key];

        if(Array.isArray(value)){

            for(let value_index of value){

                max_chaix_index = get_output_filter_max_chaix_index(value_index,max_chaix_index);

            }
        }else if(typeof value == 'object'){

            max_chaix_index =   get_output_filter_max_chaix_index(value,max_chaix_index)

        }else if(key == 'chain_index' && typeof value == 'number'){

            if(value > max_chaix_index){

                max_chaix_index = value;
            }

        }

    }

    return max_chaix_index;
}

function convert_reqObj_to_http_req(reqObj) {
    reqObj.headers = {
        //本地调用
        'x-forwarded-for': '127.0.0.1'
    };
    reqObj.get = function (MAIN_URL) {
        if(MAIN_URL === 'main_url'){
            return reqObj.main_url;
        }else if(MAIN_URL === 'source_ip'){
            return reqObj.source_ip;
        }
    };

    reqObj.url = reqObj.uri.replace(/(https?):\/\/127.0.0.1:\d+/,'');
    reqObj.interface_start_time = new Date().getTime();

    return reqObj;
}

function is_cluster() {
    if(lodash.get(process.env,Constants.ENV.IS_CLUSTER_KEY) === Constants.ENV.IS_CLUSTER_VALUE){
        return true;
    }

    return false;
}

function get_data_name(pathname) {
    let _pathname = pathname;
    if(typeof _pathname === 'string' && _pathname.includes('/')){
        _pathname = _pathname.slice(_pathname.indexOf('/') + 1,_pathname.length);
        _pathname = _pathname.slice(_pathname.indexOf('/') + 1,_pathname.length);
        _pathname = _pathname.slice(0,_pathname.indexOf('/'));

        return _pathname
    }

    return '';
}

function set_monit_name_to_req(req,config) {
    if(typeof config.monit_name !== 'undefined' && config.monit_name !== ""){
        req.monit_name = config.monit_name;
    }else{
        req.monit_name = config.name || '';
    }
}

function is_need_remove_condtions(uri) {
    let flag = false;
    CONDITIONS_WHITE_LIST.forEach(white_uri => {
         if(uri.indexOf(white_uri) !== -1){
             flag = true;
         }
    });

    return flag;
}