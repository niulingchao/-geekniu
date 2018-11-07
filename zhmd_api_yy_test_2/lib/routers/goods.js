/**
 * Created by wuxueyu on 17/7/25.
 */

const router = require('express').Router({ mergeParams: true })
const Code = require('../common/error_code')
const ZHMDCollector = require('../index')
const Data = ZHMDCollector.getModel().Data
const log4js = ZHMDCollector.getConfig().log4js;
const logger = log4js.log4js.getLogger('service');
const Keygen = ZHMDCollector.getModel().Keygen;
const global_util = require('../common/assists')
const model_util = require('../common/model_util')
const Promise = require('bluebird');
const User = ZHMDCollector.getModel().User;
const Config = ZHMDCollector.getConfig();
const queue_name = Config.baas_config.analysis_config.analysis_redis_queue_event_name;
const lodash = require('lodash')

const Redis_queue = require(process.cwd() + "/analysis/lib/redis_event_queue")


// 智能展柜商品上架

//mark 商品陈列-更换行为踩点
router.post('/zhmd/goods/smart_show_case/online.json', async function(req, res) {

    try {

        const { show_case_id, goods_spec_id, uid, source } = req.body;

        if (!(show_case_id && isNumber(show_case_id))) {

            return global_util.errorRequest(req, res, Code.MISS_PARAMS, "show_case_id")
        }

        if (!goods_spec_id && isNumber(goods_spec_id)) {

            return global_util.errorRequest(req, res, Code.MISS_PARAMS, "goods_spec_id")
        }

        if (!uid) {

            return global_util.errorRequest(req, res, Code.MISS_PARAMS, "uid");
        }

        // 获取展柜信息
        let show_case = await find_one_doc_from_Data("show_case", { "id": show_case_id })

        if (!show_case || Object.keys(show_case).length <= 0) {

            return global_util.errorRequest(req, res, Code.NOT_EXIST, `show_case_id:${show_case_id}`)

        }

        const shop_id = show_case.data.shop_id || 0;

        const remove_conditions = { "$and": [{ "data.shop_id": shop_id }, { "$or": [{ "data.show_case_id": show_case_id }] }] }

        await remove_docs_from_Data('goods_map', remove_conditions);

        const goods_spec = await find_one_doc_from_Data('goods_spec', { "id": goods_spec_id });

        if (!goods_spec) {

            return global_util.errorRequest(req, res, Code.NOT_EXIST, `goods_spec_id:${goods_spec_id}`)

        }

        const goods_id = goods_spec.data.goods_id || 0;

        const goods_map = await save_goods_map_one_goods(goods_id, goods_spec_id, show_case, shop_id, uid);

        let sensors = await find_docs_form_Data("sensor", { "data.bind_show_case_id": show_case_id });

        await Promise.map(sensors, async(sensor) => {

            let update_data = { "data.goods_id": goods_id, "data.state": 2, "data.show_case_id": show_case_id, "data.location_state": 2, "data.goods_spec_id": goods_spec_id }

            await update_docs_from_Data('sensor', { "id": sensor.id }, update_data)

        })

        if (source === 'wechat') {
            send_attrs_to_analysis(show_case_id, shop_id, goods_spec_id, goods_spec.data.head_office_id, uid,'更换')
        }

        return jsonResponse(res, goods_map, req);

    } catch (e) {

        logger.error(`/a/goods/online.json e:${e.message}`)

        return global_util.errorRequest(req, res, e.message);
    }

})

const analysis_goods_change_event_key_map = {
    baas_shop: [{
        a_key: 'shop_id',
        b_key: 'id'
    }, {
        a_key: 'shop',
        b_key: 'data.shop'
    }, {

        a_key: 'head_office_id',
        b_key: 'data.head_office_id'
    }],
    baas_goods_spec: [{
            a_key: 'goods_spec_id',
            b_key: 'id'
        }, {
            a_key: 'spec1_name',
            b_key: 'data.spec1_name'
        }, {
            a_key: 'spec1_value',
            b_key: 'data.spec1_value'
        }, {
            a_key: 'spec2_name',
            b_key: 'data.spec2_name'
        }, {
            a_key: 'spec2_value',
            b_key: 'data.spec2_value'
        }, {
            a_key: 'spec3_name',
            b_key: 'data.spec3_name'
        }, {
            a_key: 'spec3_value',
            b_key: 'data.spec3_value'
        }, {
            a_key: 'goods_name',
            b_key: 'data.goods_name'
        },
        {
            a_key: 'goods_id',
            b_key: 'data.goods_id'
        }
    ],
    baas_head_office_map: [{
        a_key: 'head_office_name',
        b_key: 'data.shop'
    }],
    baas_user_map: [{
        a_key: 'user_name',
        b_key: 'user_data.name'
    }],
    baas_plan_map: [{
        a_key: 'plan_name',
        b_key: 'data.name'

    }, {
        a_key: 'plan_id',
        b_key: 'data.plan_id'

    }],
    baas_show_case_map: [{
            a_key: 'show_case_id',
            b_key: 'id'
        },
        {
            a_key: 'show_case_name',
            b_key: 'data.name'
        },
        {
            a_key: 'show_case_location_row',
            b_key: 'data.location_row'
        },
        {
            a_key: 'show_case_location_col',
            b_key: 'data.location_col'
        }
    ]
};




//mark 更换行为踩点
async function send_attrs_to_analysis(show_case_id, shop_id, goods_spec_id, head_office_id, uid,action_type) {

    try {


        let plan_show_case = await Data('plan_show_case').findOne({ "data.show_case_id": show_case_id });

        if (!plan_show_case) {

            plan_show_case = { "data": {} }

        }

        let analysis_attrs = {};

        const [show_case_data, shop_data, goods_spec_data, head_office_data, user_data, plan_data] = await Promise.all([
            Data('show_case').findOne({ "id": show_case_id }),
            Data('shop').findOne({ "id": shop_id }),
            Data('goods_spec').findOne({ "id": goods_spec_id }),
            Data('shop').findOne({ "id": head_office_id }),
            User.findOne({ id: uid }),
            Data('plan').findOne({ "id": plan_show_case.data.plan_id || 0 })
        ]);

        const { baas_shop, baas_goods_spec, baas_head_office_map, baas_user_map, baas_plan_map, baas_show_case_map } = analysis_goods_change_event_key_map;

        baas_shop.forEach(({ a_key, b_key }) => {
            analysis_attrs[a_key] = lodash.get(shop_data, b_key);
        });

        baas_goods_spec.forEach(({ a_key, b_key }) => {
            analysis_attrs[a_key] = lodash.get(goods_spec_data, b_key);
        });

        baas_head_office_map.forEach(({ a_key, b_key }) => {

            analysis_attrs[a_key] = lodash.get(head_office_data, b_key);

        })

        baas_user_map.forEach(({ a_key, b_key }) => {

            analysis_attrs[a_key] = lodash.get(user_data, b_key);

        })
        baas_plan_map.forEach(({ a_key, b_key }) => {

            analysis_attrs[a_key] = lodash.get(plan_data, b_key)

        })

        baas_show_case_map.forEach(({ a_key, b_key }) => {

            analysis_attrs[a_key] = lodash.get(show_case_data, b_key)

        })

        //行为更换
        analysis_attrs.action_type = action_type;

        const event_data = {
            uid: -1,
            unique_uid: -1,
            event_attr: analysis_attrs,
            event: 'goods_change',
            timestamp: new Date().getTime()
        };

        //发送到队列中
        await Redis_queue.send_event_data(queue_name, event_data);


    } catch (e) {


        throw e;

    }

}


//mark 商品更换-确定行为踩点
router.post('/zhmd/goods/change/confirm.json',async(req,res)=>{
    try{
        const {show_case_id, shop_id, goods_spec_id, head_office_id, uid,source} = req.body;
        if (source === 'wechat'){
            send_attrs_to_analysis(show_case_id, shop_id, goods_spec_id, head_office_id, uid,'确认').then(_=>{});
        }
        return jsonResponse(res, true, req);
    }catch (err){
        logger.error(`/zhmd/goods/change/confirm.json e:${e.message}`);
        return global_util.errorRequest(req, res, e.message);
    }
});


//mark 商品更换-扫描行为踩点
router.post('/zhmd/goods/change/scan.json',async(req,res)=>{
    try{
        let {uid,mac_address,source} = req.body;
        //传感器地址转换成小写
        mac_address = mac_address.toLocaleLowerCase();

        const sensor = await Data('sensor').findOne({'data.mac_address':mac_address});
        if (!sensor){//传感器无效，后续调用传感器商品绑定接口
            return res.json({
                error_code:101,
                error_msg:'传感器地址无效'
            });
        }

        const {goods_id=null,goods_spec_id=null,head_office_id,shop_id,bind_show_case_id} = sensor.data;

        let result = {};
        if (goods_spec_id && goods_id && bind_show_case_id > 0){//展柜绑定的商品，后续调用货架商品绑定接口
            //查找绑定的规格
            const goods_spec = await Data('goods_spec').findOne({id:goods_spec_id});
            let goods = null;
            if (goods_spec){//根据规格找商品
                goods = await Data('goods').findOne({id:goods_spec.data.goods_id});
            }else {//无规格
                goods = await Data('goods').findOne({id:goods_id});
            }
            const {spec_pic,spec1_name,spec1_value, spec2_name, spec2_value, spec3_name, spec3_value} = goods_spec.data;
            result = {
                head_office_id,
                shop_id,
                goods_id:goods.id,
                goods_spec_id,
                show_case_id:bind_show_case_id,
                goods_name:lodash.get(goods,'data.name'),
                goods_pic:lodash.get(goods,'data.title_pics[0]'),
                spec_pic,
                spec1_name,
                spec1_value,
                spec2_name,
                spec2_value,
                spec3_name,
                spec3_value,
                bind_type:0//0：展柜商品绑定， 1：传感器商品绑定
            };
        }else if(goods_spec_id && goods_id && bind_show_case_id === -1){//传感器直接绑定的商品，后续调用传感器商品绑定接口
            //查找绑定的规格
            const goods_spec = await Data('goods_spec').findOne({id:goods_spec_id});
            let goods = null;
            if (goods_spec){//根据规格找商品
                goods = await Data('goods').findOne({id:goods_spec.data.goods_id});
            }else {//无规格
                goods = await Data('goods').findOne({id:goods_id});
            }
            const {spec_pic,spec1_name,spec1_value, spec2_name, spec2_value, spec3_name, spec3_value} = goods_spec.data;
            result = {
                head_office_id,
                shop_id,
                goods_id:goods.id,
                goods_spec_id,
                show_case_id:bind_show_case_id,
                goods_name:lodash.get(goods,'data.name'),
                goods_pic:lodash.get(goods,'data.title_pics[0]'),
                spec_pic,
                spec1_name,
                spec1_value,
                spec2_name,
                spec2_value,
                spec3_name,
                spec3_value,
                bind_type:1//0：展柜商品绑定， 1：传感器商品绑定
            };
        }else if(!goods_id && !goods_spec_id && bind_show_case_id > 0){//该传感器绑了展柜没有绑商品,需要重新绑定商品，后续调用货架商品绑定接口
            return res.json({
                error_code:103,
                result:{
                    head_office_id,
                    shop_id,
                    show_case_id:bind_show_case_id,
                }
            });
        }else {//该传感器没有绑定展柜,后续调用传感器商品绑定接口
            return res.json({
                error_code:102,
                error_msg:'该传感器没有绑定展柜'
            });
        }

        if (source === 'wechat'){//踩点
            send_attrs_to_analysis(bind_show_case_id,shop_id,goods_spec_id,head_office_id,uid,'扫描').then(_=>{});
        }

        return jsonResponse(res,result,req);
    }catch (err){
        logger.error(`/zhmd/goods/change/scan.json e:${err.message}`);
        return global_util.errorRequest(req, res, err.message);
    }
});




router.post('/zhmd/goods/unbind_spec_number/find.json', async(req, res, next) => {

    try {
        const { head_office_id } = req.body;


        if (!head_office_id) {

            return global_util.errorRequest(req, res, Code.MISS_PARAMS, "head_office_id");
        }

        const spec_query = { "$and": [{ "data.head_office_id": head_office_id }, { "data.spec_number": 0 }] }

        let goods_spec_number_result = await model_util.find_docs_form_Data('goods_spec', spec_query)
        const default_query = { "$and": [{ "data.head_office_id": head_office_id }, { "data.spec_number": -1 }, { "data.spec1_name": { "$exists": false } }] }

        let default_result = await model_util.find_docs_form_Data('goods_spec', default_query)

        default_result = await Promise.filter(default_result, async(result) => {

            let query = { "$and": [{ "data.goods_id": result.data.goods_id }, { "data.spec1_name": { "$exists": true } }] }

            let res = await model_util.find_docs_form_Data('goods_spec', query)

            if (res.length == 0) {

                return true;
            } else {
                return false;
            }
        })


        let result = goods_spec_number_result.concat(default_result)


        jsonResponse(res, result, req);


    } catch (e) {

        logger.error(`/zhmd/goods/unbind_spec_number/find.json e:${e.message}`)

        return global_util.errorRequest(req, res, e.message);
    }

})

//绑定商品到展柜上
async function save_goods_map_one_goods(goods_id, goods_spec_id, show_case, shop_id, uid) {

    try {

        var data = new Data('goods_map')();

        const key = await Keygen.issuePromise();

        data._id = key;
        data.id = key;
        data.uid = uid;
        data.data = {

            "goods_id": goods_id,
            "show_case_id": show_case.id,
            "shop_id": shop_id,
            "state": 2,
            "goods_spec_id": goods_spec_id,
            "show_case_name": show_case.data.name

        };
        return await data.save();

    } catch (e) {

        logger.error(`/a/goods/online.json save_goods_map_one_goods e:${e.message}`);

        throw e;

    }

}

async function update_docs_from_Data(table_name, update_query, update_data) {

    try {

        await Data(table_name).update(update_query, { "$set": update_data });

    } catch (e) {

        logger.error(`/a/goods/online.json update_docs_from_Data e:${e.message}`);

        throw e;

    }

}

async function remove_docs_from_Data(table_name, remove_conditions) {

    try {

        await Data(table_name).remove(remove_conditions);

    } catch (e) {

        logger.error(`/a/goods/online.json remove_docs_from_Data e:${e.message}`);

        throw e;

    }


}


// 从一个集合中获取一条记录
async function find_one_doc_from_Data(table_name, query_conditions) {

    try {

        let doc = await Data(table_name).findOne(query_conditions).lean().exec();

        return doc;

    } catch (e) {

        logger.error(`/a/goods/online.json find_one_doc_from_Data e:${e.message}`);

        throw e;

    }
}

async function find_docs_form_Data(table_name, query_conditions) {

    try {

        let docs = await Data(table_name).find(query_conditions).lean().exec();

        return docs;

    } catch (e) {

        logger.error(`/a/goods/online.json find_docs_from_Data e:${e.message}`);

        throw e;

    }

}



module.exports = router;