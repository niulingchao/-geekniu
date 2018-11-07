/**
 * Created by wuxueyu on 17/7/25.
 */

const router = require('express').Router({mergeParams:true})
const Code   = require('../common/error_code')
const  ZHMDCollector = require('../index')
const  Data = ZHMDCollector.getModel().Data
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  Keygen  = ZHMDCollector.getModel().Keygen;
const  global_util = require('../common/assists')
const  model_util = require('../common/model_util')
const Promise                   = require('bluebird');

// 智能展柜商品上架

router.post('/zhmd/goods/smart_show_case/online.json', async function (req,res) {

    try {

        const {show_case_id,goods_spec_id,uid} = req.body;

        if(!(show_case_id && isNumber(show_case_id))){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,"show_case_id")
        }

        if(!goods_spec_id && isNumber(goods_spec_id)){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,"goods_spec_id")
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,"uid");
        }

        // 获取展柜信息
        let show_case = await find_one_doc_from_Data("show_case",{"id":show_case_id})

        if(!show_case || Object.keys(show_case).length <= 0){

            return global_util.errorRequest(req,res,Code.NOT_EXIST,`show_case_id:${show_case_id}`)

        }

        const shop_id = show_case.data.shop_id || 0;

        const remove_conditions = {"$and":[{"data.shop_id":shop_id},{"$or":[{"data.show_case_id":show_case_id}]}]}

        await remove_docs_from_Data('goods_map',remove_conditions);

        const goods_spec = await find_one_doc_from_Data('goods_spec',{"id":goods_spec_id});

        if(!goods_spec){

            return global_util.errorRequest(req,res,Code.NOT_EXIST,`goods_spec_id:${goods_spec_id}`)

        }

        const goods_id = goods_spec.data.goods_id || 0;

        const goods_map = await save_goods_map_one_goods(goods_id,goods_spec_id,show_case,shop_id,uid);

        let sensors = await find_docs_form_Data("sensor",{"data.bind_show_case_id":show_case_id});

        await Promise.map(sensors,async (sensor) =>{

            let update_data = {"data.goods_id":goods_id,"data.state":2,"data.show_case_id":show_case_id,"data.location_state":2,"data.goods_spec_id":goods_spec_id}

            await update_docs_from_Data('sensor',{"id":sensor.id},update_data)

        })

        return jsonResponse(res,goods_map,req);

    }catch (e){

        logger.error(`/a/goods/online.json e:${e.message}`)

        return global_util.errorRequest(req,res,e.message);
    }

})


router.post('/zhmd/goods/unbind_spec_number/find.json',async (req,res,next) =>{

    try {
        const {head_office_id} = req.body;


        if(!head_office_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,"head_office_id");
        }

        const spec_query = {"$and":[{"data.head_office_id":head_office_id},{"data.spec_number":0}]}

        let goods_spec_number_result =  await model_util.find_docs_form_Data('goods_spec',spec_query)
        const default_query = {"$and":[{"data.head_office_id":head_office_id},{"data.spec_number":-1},{"data.spec1_name":{"$exists":false}}]}

        let default_result = await model_util.find_docs_form_Data('goods_spec',default_query)

        default_result = await  Promise.filter(default_result,async (result)=>{

                let query = {"$and":[{"data.goods_id":result.data.goods_id},{"data.spec1_name":{"$exists":true}}]}

                let res  =  await model_util.find_docs_form_Data('goods_spec',query)

                if(res.length == 0){

                    return true;
                }else {
                    return false;
                }
            }
        )


        let result = goods_spec_number_result.concat(default_result)


        jsonResponse(res,result,req);


    }catch (e){

        logger.error(`/zhmd/goods/unbind_spec_number/find.json e:${e.message}`)

        return global_util.errorRequest(req,res,e.message);
    }

})

//绑定商品到展柜上
async function save_goods_map_one_goods(goods_id,goods_spec_id,show_case,shop_id,uid) {

    try{

        var data = new Data('goods_map')();

        const key = await Keygen.issuePromise();

        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = {

            "goods_id":goods_id,
            "show_case_id":show_case.id,
            "shop_id":shop_id,
            "state":2,
            "goods_spec_id":goods_spec_id,
            "show_case_name":show_case.data.name

        };
        return  await data.save();

    }catch (e){

        logger.error(`/a/goods/online.json save_goods_map_one_goods e:${e.message}`);

        throw e;

    }

}

async function update_docs_from_Data(table_name,update_query,update_data) {

    try{

        await Data(table_name).update(update_query,{"$set":update_data});

    }catch (e){

        logger.error(`/a/goods/online.json update_docs_from_Data e:${e.message}`);

        throw e;

    }

}

async function remove_docs_from_Data(table_name,remove_conditions) {

    try{

        await Data(table_name).remove(remove_conditions);

    }catch (e){

        logger.error(`/a/goods/online.json remove_docs_from_Data e:${e.message}`);

        throw e;

    }


}


// 从一个集合中获取一条记录
async function find_one_doc_from_Data(table_name,query_conditions) {

    try {

        let doc = await Data(table_name).findOne(query_conditions).lean().exec();

        return doc;

    }catch (e){

        logger.error(`/a/goods/online.json find_one_doc_from_Data e:${e.message}`);

        throw e;

    }
}

async function find_docs_form_Data(table_name,query_conditions) {

    try {

        let docs = await Data(table_name).find(query_conditions).lean().exec();

        return docs;

    }catch (e){

        logger.error(`/a/goods/online.json find_docs_from_Data e:${e.message}`);

        throw e;

    }

}



module.exports = router;







