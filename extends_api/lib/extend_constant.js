 /**
 * Created by yuanyuan on 16/8/18.
 */
`use strict`;
const merge = require('merge');
const process = require('process');
const extend_parse = require(process.cwd() + '/lib/extend_parse.js');
const lodash = require('lodash');

let log4js;
let logger;
let debug_logger;

//替换参数时,用来匹配表达式
const reg_fun = /\$\w+\(/i;
 //匹配%$$abc%这样的字符串
 //说明:如果%$$abc%出现在表达式中,会被表达式替换
const reg_like = new RegExp('(\\%?)\\$\\$\\w+(\\%?)','i');

var extend_constant = {
    'api_type': {
        'combined_api':'combined_api',
        'pro_op_api': 'pro_op_api'
    },
    'sub_api_type': {
        'ask': 'ask',
        'ask_ifelse': 'ask_ifelse',
        'ask_batch': 'ask_batch',
        'do': 'do',
        'do_batch': 'do_batch',
        'find_batch': 'find_batch',
        'ask_do': 'ask_do',
    },
    'sub_api_related_type': {
        'and': 'and',
        'or': 'or'
    }
};

function init(dependence_obj) {
    if(dependence_obj.log4js) log4js = dependence_obj.log4js;

    logger  = log4js.log4js.getLogger('service');
    debug_logger  = log4js.log4js.getLogger('debug');
}

extend_constant.build_user_params = function (user_params,body) {

    var obj = {};
    for(var param in user_params){

        if(user_params[param]['param_key']){
            let param_key  = user_params[param]['param_key'];
            let is_forced = 0;
            if(user_params[param]['is_forced'] == 1 || user_params[param]['is_forced'] == true){
                is_forced = 1;
            }
            let param_type = user_params[param]['param_type'];
            let param_desc = user_params[param]['param_desc'];

            if(is_forced === 0){
                if(body && body[param_key] !== null && body[param_key] !== undefined && body[param_key] !== NaN){
                    user_params[param][param_key] = convert_user_param_by_type(param_type,body[param_key]);
                }else{

                }
            }else if(is_forced === 1){
                if(body && body[param_key] !== null && body[param_key] !== undefined && body[param_key] !== NaN && body[param_key] !== ''){
                    user_params[param][param_key] = convert_user_param_by_type(param_type,body[param_key]);
                }else{
                    obj.status = -1;
                    obj.name   = param_key;
                    return obj;
                }
            }else{

            }

            delete user_params[param]['is_forced'];
            delete user_params[param]['param_type'];
            delete user_params[param]['param_desc'];
            delete user_params[param]['param_key'];
        }else{
            var keys = Object.keys(user_params[param]);

            //判断是否必传
            var is_forced = user_params[param]['is_forced'];

            if(keys.length == 2){
                if(keys[0] == 'is_forced'){
                    var key_name = keys[1];
                }else{
                    var key_name = keys[0];
                }
            }else{
                //user_params数组中对应的object只有一个key,是不符合定义的
                obj.status = -1;
                obj.name   = '格式错误';
                return obj;
            }

            if(is_forced == '0'){
                if(body && body[key_name] !== null){
                    user_params[param][key_name] = body[key_name];
                }else{
                    delete user_params[param][key_name];
                    //user_params[param][key_name] = null;
                }
            }else if(is_forced == '1'){
                if(body[key_name] != undefined){
                    user_params[param][key_name] = body[key_name];
                }else{
                    //参数是否正常
                    obj.status = -1;
                    obj.name   = key_name;
                    return obj;
                }
            }else{
                //is_forced不存在的情况,正常情况下不会发生,如果异常放过
            }
        }
    }

    return user_params;
};

extend_constant.build_default_params = function (default_params,user_params) {


    loop_params(default_params,user_params);


    return default_params;

};

extend_constant.build_processReVariables = function (params,value,variables,identifier) {


    if(isJsonForDefaultParam(params)){
        try{
            params = JSON.parse(params);
        }catch(e){

        }
    }

    params = loop_re_params(params,value,variables,identifier);


    return params;
};

function loop_params(default_params,user_params) {


    for(var param of Object.keys(default_params)){

        if(isJsonForDefaultParam(default_params[param])){
            try{
                default_params[param] = JSON.parse(default_params[param]);
            }catch(e){

            }

            loop_params(default_params[param],user_params);
        }else{
            handle_params(default_params[param],default_params,user_params,param);
        }

    }

}

function loop_re_params(params,value,variables,identifier) {

    if(typeof params !== 'object'){
        //null只用做占位
        params = handle_re_params(params,null,value,variables,identifier);
    }else{
        for(var param of Object.keys(params)){

            // if(isJsonForDefaultParam(params[param]))){
            //$and:[{"id":"__middle_result[0].result[0].data.parent_id"}]
            if(isJsonFor__Param(params[param])){
                try{
                    params[param] = JSON.parse(params[param]);
                }catch(e){

                }

                loop_re_params(params[param],value,variables,identifier);
            }else{
                params = handle_re_params(params,param,value,variables,identifier);
            }

        }
    }

    return params;
}
 // variables = __middle_result[0].result[0].id ,identifier = __middle_result
 // variables = '__loop_item.uid'  ,identifier = __loop_item
 // value = 1066139246460929
 // params = __middle_result[0].result[0].id

 function handle_re_params(params,param,value,variables,identifier) {

     if(typeof params === 'string'){

         if(reg_fun.test(params) ){
             if(typeof value === 'string') value = "'" + value + "'";
             if(typeof value === 'object') value = JSON.stringify(value);
             if(typeof value !== 'string') value = value.toString();
             //value不能出现双引号
             if(typeof value === 'string') value = value.replace(/\"/g,"'");

             if(params.indexOf("'" + variables + "'") !== -1){
                 params = params.replace("'" + variables + "'",value);
             }else{
                 params = params.replace(variables,value);
             }
         }else if(params === variables){
             params = value;
         }else{

         }
     }else if(typeof params[param] == 'string' && params[param].indexOf(identifier) !== -1){

         if(reg_fun.test(params[param]) ){
             if(typeof value === 'string') value = "'" + value + "'";
             if(typeof value === 'object') value = JSON.stringify(value);
             if(typeof value !== 'string') value = value.toString();
             //value不能出现双引号
             if(typeof value === 'string') value = value.replace(/\"/g,"'");

             if(params[param].indexOf("'" + variables + "'") !== -1){
                 params[param] = params[param].replace("'" + variables + "'",value);
             }else{
                 params[param] = params[param].replace(variables,value);
             }
         }else if(params[param] === variables){
             params[param] = value;
         }else{

         }
     }


     return params;
 }

function handle_params(value,default_params,user_params,param) {

    if( typeof default_params[param] == 'string' && default_params[param].indexOf('$$') !== -1){
        user_params.forEach(function(indexValue){

	    let index = Object.assign({},indexValue);

            for( let key of Object.keys(index) ){
                //index有两个属性，is_forced 为固定属性且此时不需关注，另一key不固定
                if (key == 'is_forced') continue;
                if(index[key] == null){
                    continue;
                }

                //加了 \b 之后,来让它匹配单词边界,否则 $to_array($$item_spec_value) 会匹配 $$item_spec对应的value值
                let reg = new RegExp('\\$\\$'+key + '\\b', 'i');



                if(reg_fun.test(default_params[param]) ){
                    let reg_1 = new RegExp('\'\\$\\$'+key + '\\b', 'i');
                    if(reg_1.test(default_params[param])){

                        let index_key = index[key];
                        if(Array.isArray(index[key])){

                            index_key = JSON.stringify(index[key]);
                            index_key = index_key.replace(/\"/g,"'");
                        }

                        default_params[param] = default_params[param].replace(reg, index_key);
                    }else{
                        if(typeof index[key] == 'string') index[key] = '\'' + index[key] + '\'';

                        let index_key = index[key];
                        if(Array.isArray(index[key])){

                            index_key = JSON.stringify(index[key]);
                            index_key = index_key.replace(/\"/g,"'");
                        }
                        default_params[param] = default_params[param].replace(reg, index_key);
                    }

                }else if(typeof default_params[param] == 'string' && key == default_params[param].slice(2,default_params[param].length)){
                   /* let reg2 = new RegExp(default_params[param].slice(2,default_params[param].length),'i');
                    if(reg2.test(key)){
                        default_params[param] = index[key];
                    }*/
                   default_params[param] = index[key];
                }else if(reg_like.test(default_params[param])){//支持解析表达式 $like模糊查询
                    default_params[param] = default_params[param].replace(reg,index[key]);
                }else {//不支持

                }

            }
        });
    }

    /*
    在2017年.1月.5日之前的代码是这样的,为什么是这样的就不知道了,历史遗留,这块代码是用来当默认参数替换不成功时,删除默认参数.
     if( typeof default_params[param] == 'string' && default_params[param].indexOf('$$') !== -1){
     //throw new Error(param);
     delete default_params[param];
     }
     */

    /*
     在2017年.1月.5日之后的代码如下,是为了兼容之前的接口,只对$default_param生效,否则eval会报错
     */
    if( typeof default_params[param] == 'string' && default_params[param].indexOf('$$') !== -1 && default_params[param].indexOf('$default_param') === -1){
        //throw new Error(param);
        delete default_params[param];
    }else{
        //对$default_param($$uid,1)这样的表达式,如果$$uid不加引号,给它补一个
        default_params[param] = handle_default_param_expression(default_params,param);
    }

    default_params[param] = handle_default_param_expression_for_comma(default_params,param);


    default_params[param] = extend_parse.expressionCompile( default_params[param] );

    extend_parse.replace(param, default_params);

}


function str_sub(str) {

    str = str.slice(5,str.length);
    str = str.slice(0,-1);

    var strs = str.split(',');
    var result = [];

    for(var i in strs){

        if(strs[i].startsWith('$$')){
            result[0] = strs[i].slice(2,strs[i].length);
        }else{
            result[1] = strs[i];
        }
    }

    return result;
};


extend_constant.merge_params = function(default_params,sort_by,limit) {
    var body = {};

    body = merge_params_conditions(default_params,body);
   // body = merge_params_conditions(user_params,body);

    if(body['sort_by']) {
        //@by wjc 如果body里有sort_by,就不要替换填写的sort_by参数,这是为了满足一个接口有多种排序情况.
    }else {
        if(sort_by && sort_by.key && sort_by.order){
            body['sort_by'] = sort_by;
        }else if(typeof sort_by === 'object'){
            body['sort_by'] = sort_by;
        }else{

        }
    }

    if(isNaN(body['limit'])){
        body['limit'] = limit;
    }

    return body;


};

 /**
  * 用来判断extend_api当为find时,对默认参数进行的删空值或删$$参数
  */
extend_constant.handle_object = function handle_object(obj) {

    if (!isJsonForExtendsApi(obj)) {
         return obj;
     }

     let flag = {
         'flag': false
     };

    loop_object_param(obj, flag);

     if (flag.flag) {
         handle_object(obj);
     }

    return obj;
};
// 遍历默认参数中的value,删除value值为 null,undefined,[]和包含$$的键值对
function loop_object_param(obj, flag) {
     if (typeof obj !== 'object') {
         return obj;
     }

     let keys = Object.keys(obj);

     for (let i = 0; i < keys.length; i++) {
         // 兼容$is_not_blank_array操作符转化成 {'$nin':[[],null]}的特殊情况，对数组中的 []、null 不进行删除
         if(keys[i] === '$nin'){
             continue;
         }
         // 兼容$is_blank_array操作符转化成 {'$in':[[],null]}的特殊情况，对数组中的 []、null 不进行删除
         if(keys[i] === '$in' && Array.isArray(obj[keys[i]])&& obj[keys[i]].toString() === [[],null].toString()){
             continue;
         }
         //当value=null 或 undefined时候,删除key
         //if (obj[keys[i]] === null || obj[keys[i]] === undefined) {
         if (obj[keys[i]] === undefined) {
             flag.flag = true;
             if(Array.isArray(obj)){
                 obj.splice(i,1);
             }else{
                 delete obj[keys[i]];
             }
         //当value是一个JSON时,就继续递归自己
         } else if (isJsonForExtendsApi(obj[keys[i]])) {
             //value是一个json,如果里面还有很多key,就继续递归调用
             if (Object.keys(obj[keys[i]]).length !== 0) {
                 loop_object_param(obj[keys[i]], flag);
             //否则就直接删除空json
             } else {
                 flag.flag = true;
                 if(Array.isArray(obj)){
                     obj.splice(i,1);
                 }else{
                     delete obj[keys[i]];
                 }
             }
         //如果value是string且包含未替换的$$,就删除
         } else if (typeof obj[keys[i]] === 'string') {
             if (obj[keys[i]].indexOf('$$') > -1) {
                 flag.flag = true;
                 if(Array.isArray(obj)){
                     obj.splice(i,1);
                 }else{
                     delete obj[keys[i]];
                 }
             }
         } else {
         }
     }
}

function isJsonForExtendsApi(value) {

     if (value === null || typeof value === 'number') {
         return false;
     }

     if (typeof value == 'object') {
         return true;
     }

     if (typeof value == 'string' && value.indexOf('{') == -1) {
         return false;
     }

     try {
         JSON.parse(value);
         return true;
     } catch (e) {
         return false;
     }
};


function merge_params_conditions(default_params,body) {

    for (var attrname in default_params) {

        body = lodash.merge(body,default_params[attrname]);
    }

    return body;

}

function convert_user_param_by_type(param_type,value) {
    switch (param_type){
        case 'string':
            return value + '';
        case 'int':
            try{
                let result = parseInt(value);
                return result;
            }catch (e){
                logger.error('convert_user_param_by_type fail,value = ' + value + ' param_type = ' + param_type);
                return value;
            }
        case 'float':
            try{
                let result = parseFloat(value);
                return result;
            }catch (e){
                logger.error('convert_user_param_by_type fail,value = ' + value + ' param_type = ' + param_type);
                return value;
            }
        case 'long':
            try{
                let result = new Number(value).valueOf();
                return result;
            }catch (e){
                logger.error('convert_user_param_by_type fail,value = ' + value + ' param_type = ' + param_type);
                return value;
            }
        default:
            return value;
    }
}

function isJsonForDefaultParam(value) {

     if (value === null || typeof value === 'number') {
         return false;
     }

     if(Array.isArray(value) && JSON.stringify(value).indexOf('$') === -1){
         return false;
     }

     if (typeof value == 'object') {
         return true;
     }

     if (typeof value == 'string' && value.indexOf('{') == -1) {
         return false;
     }

     try {
         JSON.parse(value);
         return true;
     } catch (e) {
         return false;
     }
};

function isJsonArray(value) {

    if(value === null || typeof value === 'number'){

        return false;
    }

    if(Array.isArray(value)){

        for(let index_value of value){

             if(index_value && typeof index_value === 'object'){

                return true;
             }
        }
        return false;
    }

    return false;

}


function isJsonFor__Param(value) {

     if (value === null || typeof value === 'number') {
         return false;
     }

     if(Array.isArray(value) && JSON.stringify(value).indexOf('__') === -1){
         return false;
     }

     if (typeof value == 'object') {
         return true;
     }

     if (typeof value == 'string' && value.indexOf('{') == -1) {
         return false;
     }

     try {
         JSON.parse(value);
         return true;
     } catch (e) {
         return false;
     }
};

/*
以下类型都均通过测验
 let default_params   = {"name":"$default_param($$uid,123)"};                  // $default_param('$$uid',123)
 let default_params_1 = {"name":"$default_param('$$uid',123)"};               // $default_param('$$uid',123)
 let default_params_2 = {"name":"$add($default_param($$uid,123),2)"};        // $add($default_param('$$uid',123),2)
 let default_params_3 = {"name":"$add($default_param('$$uid',123),2)"};     // $add($default_param('$$uid',123),2)
 let default_params_4 = {"name":"$add($default_param($$uid,123),$$abc)"};  // $add($default_param('$$uid',123),'$$abc')
 */
function handle_default_param_expression(default_params,param) {
    //匹配表达式,$$不包含单双引号,比如$default_param($$uid,123) 这样的
    let reg = /[^'"]\$\$\w+/g;

    if(reg.test(default_params[param])){
        let result_arr = default_params[param].match(reg);
        result_arr.map(item => {
            // item = ($$uid
            // 所以新串需要在 (到$中间加一个单引号,并且追一个$$($$会被替换为一个$符,https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace),最后再拼一个单引号
            let res_item = item.slice(0,1) + "'$$" + item.slice(1,item.length) + "'";
            default_params[param] = default_params[param].replace(item,res_item);
        })
    }

    return default_params[param]
}

/*
处理 $default_param(,0) 这样的情况
这样的情况出现原因是 $default_param(__re_middle_result.result[0].data.trip_participate_count,0) --> 定义后台定义的
因为__re_middle_result.result[0].data.trip_participate_count 找不到对应的value值,会返回 '',就会变成 $default_param(,0),所以要变成$default_param('',0),这样才不会执行失败
 */
function handle_default_param_expression_for_comma(default_params,param) {
    //处理$default_param(,0)
    let reg = /\$default_param\(\,/g;
    if(reg.test(default_params[param])){
        default_params[param] = default_params[param].replace(reg,"$default_param('',");
    }

    //处理$_sub不加单引号的情况
    let reg_baas_operator = /\$_(sub|add|mul)\(/;
    if(reg_baas_operator.test(default_params[param]) && extend_parse.reg.test(default_params[param])){
        default_params[param] = handle_baas_operator_quote(default_params[param]);
    }
        
    //处理$sys_constant不加单引号的情况
    let regex_sys_constant = /\$sys_constant\(.+?\)/g;
    if(regex_sys_constant.test(default_params[param])){
        let result = default_params[param].match(regex_sys_constant);

        default_params[param] = handle_str_replace(result,default_params[param],'$sys_constant'.length + 1);
    }


    return default_params[param]
}

/*
处理 $_sub(data.price,$to_num(10));这样的情况
以下case通过测试
 let str = "$_sub(data.storage,$_add(data.name,$to_num(2)))";
 let str_1 = "$_sub('data.storage',$_add(data.name,$to_num(2)))";
 let str_2 = "$_sub(data.storage,$_add('data.name',$to_num(2)))";
 let str_3 = "$_sub('data.storage',$_add('data.name',$to_num(2)))";
 let str1 = "$_sub(data.storage,$_add($to_num(2),data.name))";
 let str2 = "$_sub($_add(data.name,$to_num(2)),data.storage)";
 let str3 = "$_sub($_add(data.name,$to_num(2)),'data.storage')";
 let str4 = "$_sub('data.storage',$_add(data.name,$to_num(2)))";
 */
function handle_baas_operator_quote(default_param_value) {
    let regex_left = /\([^(]*?[,)]/g;
    let regex_right = /,[^,]*?\)/g;

    if(regex_left.test(default_param_value)){
        let result = default_param_value.match(regex_left);

        default_param_value = handle_str_replace(result,default_param_value);
    }

    if(regex_right.test(default_param_value)){
        let result = default_param_value.match(regex_right);

        default_param_value = handle_str_replace(result,default_param_value);
    }

    return default_param_value;
}

function handle_str_replace(result,str,str_pre,str_suf) {
     result.forEach(item => {

        let old_item = item;
        let temp_item = slice_str_pre_and_suf(item,str_pre,str_suf);

        if(isNaN(temp_item) && temp_item.indexOf('$') === -1 && temp_item.indexOf("'") === -1){
             let replace_item = "'" + temp_item + "'";
             let new_item = old_item.replace(temp_item,replace_item);
             str  = str.replace(old_item,new_item);
        }
    });

    return str;
}

function slice_str_pre_and_suf(str,str_pre,str_suf) {
    if(typeof str_pre === 'undefined'){
        str_pre = 1;
    }
    if(typeof str_suf === 'undefined'){
        str_suf = str.length - 1;
    }
    return str.slice(str_pre,str_suf);
}

module.exports = function (dependence_obj) {
    init(dependence_obj);

    return extend_constant;
};
