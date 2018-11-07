/**
 * Created by xiaos on 2017/8/23.
 */
const router = require('express').Router({mergeParams:true})
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  model_util   = require('../../common/model_util')
const  global_util = require('../../common/assists')
const Config = ZHMDCollector.getConfig();
const lodash = require('lodash')
const path = require("path")
const moment = require("moment")
const process = require("process")
const Util_Send_Sms = require(process.cwd() + "/lib/sendSmsMethods.js")
const rp = require('request-promise');

const white_phones = require("./white_phone_list.json");

const analysis_calculate_url = `${Config.baas_config.analysis_config.analysis_server_url}warning/goods/int_count_list.json`;

//调用analysis暴露出来的接口，filter倍数超过约定的数据，组成短信发送
router.post('/zhmd/goods_warning/report.json',async(req,res)=>{
    try{
        const {multiple=4} = req.body;

        const goods_list = async()=>{
            const options = {
                method: 'POST',
                uri: `${analysis_calculate_url}`,
                body: {},
                json: true
            };
            return rp(options);
        };
        const {result:list} = await goods_list();

        //昨日体验数大于10且今日涨幅4倍以上
        const warning_list = list.filter(data=>{
            return data.multiple >= multiple && data.pre_int_count > 10;
        });

        //短信内容 - 每个商品发一条信息
        const sms_msg_list = warning_list.map(data=>{
            const {shop_id, shop_name, goods_id, goods_name, int_count, pre_int_count,multiple} = data;
            logger.info(`数据异常!\n门店id:${shop_id}\n商品id:${goods_id}\n门店:${shop_name}\n商品:${goods_name}\n异常上升:${(multiple*100).toFixed(0)}%\n昨日体验数:${pre_int_count}\n今日体验数:${int_count}\n`);
            return `数据异常!\n门店:${shop_name}\n商品:${goods_name}\n异常上升:${(multiple*100).toFixed(0)}%\n昨日体验数:${pre_int_count}\n今日体验数:${int_count}\n`;
        });

        //数据异常电话白名单
        const phones = white_phones.data_warning_persons.map(p=>p.phone).join(',');

        let provider = Config.config_manager['sms']['luosimao'];
        const tasks = sms_msg_list.map(msg=>{
            return Util_Send_Sms.send_msg_with_luosimao(provider,phones,msg);
        });
        await Promise.all(tasks);

        return global_util.jsonResponse(res,true,req)
    }catch (err){
        logger.error(`goods_int_count_warning e:${e.message}`);
        return  global_util.errorRequest(req,res,e.message)
    }
});

module.exports = router;


