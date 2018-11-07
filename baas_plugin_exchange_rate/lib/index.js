/**
 * Created by yuanyuan on 17/9/5.
 */
const ExchangeRateRouter = require('./routers/exchange_rate');

class ExchangeRatePlugin{
    constructor(app){
        this.app    = app || {};
        this.baas   = this.app.baas || {};
        this.router = this.baas.router || {};
        this.config = this.baas.config || {};
        this.logger = this.baas.config.log4js.log4js.getLogger('service');
        this.appkey = this.baas.config.baas_config.plugin_exchange_rate_appkey;

    }

    start(){
        //查询所有汇率
        this.router.post('/custom/plugin/exchange_rate/query.json',ExchangeRateRouter.get_all_currency.bind(this));
        //按汇率转换金额
        this.router.post('/custom/plugin/exchange_rate/convert.json',ExchangeRateRouter.convert_exchange_rate.bind(this));
    }

    stop(){

    }
}


module.exports = ExchangeRatePlugin;