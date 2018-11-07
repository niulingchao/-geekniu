/**
 * Created by wuxueyu on 17/8/1.
 */
const router = require('express').Router({mergeParams:true})
const Code   = require('../common/error_code')
const  ZHMDCollector = require('../index')
const  Data = ZHMDCollector.getModel().Data
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  global_util = require('../common/assists')
const Config = ZHMDCollector.getConfig();
const lodash = require('lodash')
const path = require("path")
const request_promise = require("request-promise")

router.post('/zhmd/show_case_coord/heat_map.json',async (req,res,next)=> {

    try{

        let  {shop_id,start_time,end_time} = req.body;

        if(!shop_id || global_util.isNotNumber(shop_id)){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'shop_id');
        }

        start_time = start_time || 1;
        end_time   = end_time || 9999999999999999999999999;

        let  show_case_coord = await find_show_case_coord_by_shop_id(shop_id)

        let  heat_map = await analysis_calculate_show_case_coord(start_time,end_time,shop_id)

        let result = group_join_data(show_case_coord,heat_map);

        return global_util.jsonResponse(res,result,req)


    }catch (e){

        logger.error(`/zhmd/show_case_coord/heat_map.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);

    }

})

function group_join_data(show_case_coord,heat_map) {

    const map_arr = [];

    show_case_coord.map((show_case_coord) =>{

        let show_case_coord_id = show_case_coord.id

        let value_obj = {"value":0,"valuetype":'',"code":show_case_coord_id}

        if(Array.isArray(show_case_coord.object_ids)){

            show_case_coord.object_ids.map((item) =>{

                const find_show_case =  lodash.find(heat_map, function(heat) {
                    return heat.show_case_id == item ;
                });
                if(find_show_case){
                    value_obj.value += (find_show_case.value || 0);
                    if(find_show_case.valuetype){
                        value_obj.valuetype = find_show_case.valuetype}
                }
            })
        }
        map_arr.push(value_obj);
    })

    return map_arr
}

async function analysis_calculate_show_case_coord(start_time,end_time,shop_id) {

    try {

        const server_url_path = 'baas_config.analysis_config.analysis_server_url'

        if(!lodash.has(Config,server_url_path)){

            return global_util.errorRequest(req,res,'缺少analysis_server_url 配置')

        }
        const url = lodash.get(Config,server_url_path) + 'analysis/util/calculate.json'

        const body = {"schema_type":"event","event":"sensor_report","batch":[{"cal_function":"count","cal_param":"id","result_key":"value"},{"cal_function":"value","cal_param":"event_attr.valuetype","result_key":"valuetype"}],
            "start_time":start_time,"end_time":end_time,"group_by":[{"group_key":"event_attr.show_case_id","result_key":"show_case_id"}],"limit":20000,"out_filters":[{"function":"$divide","params":2,"field_key":"value"}],"conditions":{"event_attr.shop_id":shop_id}}
        let options = {
            'url':url,
            'method':'POST',
            'json':true,
            'body':body
        }
        let result =   await request_promise(options)

        if(result['error_code'] == 0){

            return result['result'];
        }else {

            let e = new Error(result['error_msg'])

            throw e;
        }
    }catch (e){

        throw e;

    }
}


async function find_show_case_coord_by_shop_id(shop_id) {

    try {
        let show_case_coord =  await Data('show_case_coord').aggregate()
            .match({"data.shop_id":shop_id,"data.object_type":"show_case"})
            .group({_id:"$id",object_ids:{$first:"$data.object_ids"},id:{$first:"$id"}})
            .project({"_id":0,"id":1,"object_ids":1})
            .exec()

        return show_case_coord;
    }catch (e){

        logger.error(`/zhmd/show_case_coord/heat_map.json shop_id:${shop_id} e:${e.message}`)

        throw e;
    }
}

module.exports = router;

