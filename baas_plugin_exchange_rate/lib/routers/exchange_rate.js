/**
 * Created by yuanyuan on 17/9/5.
 */
const lodash             = require('lodash');
const request            = require('request');
const Code               = require('../error_code');
const normalUtil         = require('normalUtil');
const numeral            = require('numeral');

const ExchangeRateRouter = {};

const URL_PRE = 'https://op.juhe.cn/onebox/exchange/';
const QUERY_URL = 'list';
const CONVERT_URL = 'currency';

ExchangeRateRouter.get_all_currency = async function (req,res) {
    try{
        if(typeof this.appkey !== 'string' || this.appkey.length === 0){
            const err_code = lodash.merge(Code.CONFIG_ERROR);
            err_code.error_msg = err_code.error_msg.replace("聚合数据");

            return errorRequest(req,res,err_code);
        }

        const url = `${URL_PRE}${QUERY_URL}?key=${this.appkey}`;
        const result = await httpGet(url);

        if(result && result.error_code === 0){
            return jsonResponse(res,result.result.list,req);
        }else{
            this.logger.error(`ExchangeRateRouter.get_all_currency query error,e = ${JSON.stringify(result)}`);
            const error_msg = error_code_map(result.error_code);

            return errorRequest(req,res,error_msg);
        }
    }catch (e){
        this.logger.error(`ExchangeRateRouter.get_all_currency error,e = ${e.toString()}`);

        return errorRequest(req,res,e.toString());
    }

};

ExchangeRateRouter.convert_exchange_rate = async function (req,res) {
    let {from,to,money} = req.body;

    if(typeof this.appkey !== 'string' || this.appkey.length === 0){
        const err_code = lodash.merge(Code.CONFIG_ERROR);
        err_code.error_msg = err_code.error_msg.replace("聚合数据");

        return errorRequest(req,res,err_code);
    }

    check_param(from,to,money);

    money = normalUtil.parseFloatForce(money);

    const url = `${URL_PRE}${CONVERT_URL}?key=${this.appkey}&from=${from}&to=${to}`;
    const result = await httpGet(url);

    if(result && result.error_code === 0){
        let exchange = 0;
        for(let item of result.result){
            if(item.currencyF === from){
                exchange = item.exchange;
            }
        }

        exchange = parseFloat(exchange);

        const exchange_money = numeral(money).multiply(exchange).value();
        return jsonResponse(res,exchange_money,req);
    }else{
        this.logger.error(`ExchangeRateRouter.convert_exchange_rate convert error,e = ${JSON.stringify(result)}`);
        const error_msg = error_code_map(result.error_code);

        return errorRequest(req,res,error_msg);
    }
};

function check_param(from,to,money) {
    if(typeof from !== 'string'){
        const error_code = lodash.merge({},Code.ILLEGAL_PARAMS);
        error_code.error_msg = error_code.error_msg.replace('%s','from');
        error_code.error_msg = error_code.error_msg.replace('%s','string');
        error_code.error_msg = error_code.error_msg.replace('%s',typeof from);

        throw error_code;
    }

    if(typeof to !== 'string'){
        const error_code = lodash.merge({},Code.ILLEGAL_PARAMS);
        error_code.error_msg = error_code.error_msg.replace('%s','to');
        error_code.error_msg = error_code.error_msg.replace('%s','string');
        error_code.error_msg = error_code.error_msg.replace('%s',typeof to);

        throw error_code;
    }

    if(!normalUtil.isNumber(money)){
        const error_code = lodash.merge({},Code.ILLEGAL_PARAMS);
        error_code.error_msg = error_code.error_msg.replace('%s','money');
        error_code.error_msg = error_code.error_msg.replace('%s','string');
        error_code.error_msg = error_code.error_msg.replace('%s',typeof money);

        throw error_code;
    }
}

function error_code_map(error_code) {
    switch (error_code){
        case 208001:
            return "货币兑换名称不能为空";
        case 208002:
            return "查询不到汇率相关信息";
        case 208003:
            return "网络错误，请重试";
        case 208004:
            return "查询不到常用货币相关信息";
        case 208005:
            return "不存在的货币种类";
        case 208006:
            return "查询不到该货币兑换相关信息";
        case 10001:
            return "错误的请求KEY";
        case 10002:
            return "该请求KEY无请求权限";
        case 10003:
            return "KEY过期";
        case 10004:
            return "错误的OPENID";
        case 10005:
            return "应用未审核超时,请提交认证";
        case 10007:
            return "未知的请求源";
        case 10008:
            return "被禁止的IP";
        case 10009:
            return "被禁止的KEY";
        case 100011:
            return "当前IP请求超过限制";
        case 100012:
            return "请求超过次数限制";
        case 100013:
            return "测试KEY超过请求限制";
        case 100014:
            return "系统内部异常";
        case 10020:
            return "接口维护";
        case 10021:
            return "接口停用";
        default:
            return "未知错误";
    }
}

async function httpGet(url) {
    return new Promise((resolve,reject) => {
        request(url,function (err,res,body) {
            if(err) return reject(err);

            try{
                body = JSON.parse(body);
            }catch (e){

            }
            return resolve(body);
        })
    });
}

module.exports = ExchangeRateRouter;