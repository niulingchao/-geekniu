/**
 * Created by wuxueyu on 17/8/7.
 */

const router = require('express').Router({mergeParams:true})
const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  Data = ZHMDCollector.getModel().Data
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  Keygen  = ZHMDCollector.getModel().Keygen;
const  global_util = require('../../common/assists')
const  model_util  = require('../../common/model_util')
const Promise                   = require('bluebird');
const XLSX          = require('xlsx');
const lodash        = require('lodash');

router.post('/zhmd/skq/goods_export.json', async (req,res,next) =>{

    try {

        let  {head_office_id,uid} = req.body;

        if(!req.files){

            return global_util.errorRequest(req,res,Code.CHECK_MULTIPART);
        }
        let file = req.files.file;

        if(!file){
            return  global_util.errorRequest(req,res,Code.MISS_PARAMS,'file');
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'uid')
        }
        if(!head_office_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'head_office_id');
        }

        if(global_util.isNotNumber(head_office_id)){

            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'head_office_id')
        }

        head_office_id = global_util.parseIntThrowError(head_office_id);

        uid = global_util.parseIntThrowError(uid)

        //excel 数据转 json
        const {result,sheetName}  = await handle_excel_to_json_array(file)

        // json 数据去重
        let result_map =  handle_goods_distinct(result[sheetName])


        await handle_goods(result_map,head_office_id,uid);

        return global_util.jsonResponse(res,true,req)

    }catch (e){

        logger.error(`/zhmd/skq/goods_export.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);
    }

})

// 处理商品去重
function handle_goods_distinct(result) {

    let map = new Map();

    result.map(item =>{

        let goods_number = item['goods_number'];

        let goods_info_arr = global_util.splite_string_to_array(goods_number,'/')

        if(Array.isArray(goods_info_arr) && goods_info_arr.length >= 2){

            const goods_name = goods_info_arr[0];
            const goods_spec_name = goods_info_arr[1];

            if(map.has(goods_name)){
                let values = map.get(goods_name)
                if(!Array.isArray(values)) values = []

                if(values.indexOf(goods_spec_name) == -1){
                    values.push(goods_spec_name);
                }
            }else {
                map.set(goods_name,[goods_spec_name]);
            }
        }
    })

    logger.info(`handle_goods_distinct count:${[...map.keys()].length}`)

    return map

}


// 处理商品去重
function handle_goods_distinct_common(result) {

    let map = new Map();
    result.map(item =>{

        let {goods_name,goods_spec_name,goods_brand,pic_url,goods_price,popularize_level,first_class,second_class,sex,product_season,color} = item;

        if(goods_name){

            if(map.has(goods_name)){
                let value = map.get(goods_name);
                if(!Array.isArray(value.goods_spec_obj_arr)){
                    value.goods_spec_obj_arr = [];
                }

                if(typeof lodash.find(value.goods_spec_obj_arr,{'goods_name': goods_spec_name}) === 'undefined'){

                    let spec_value = {
                        goods_name: goods_spec_name,
                        spec_pic: pic_url
                    };

                    if(color !== undefined || color !== null){

                        spec_value["color"] = color;
                    }

                    value.goods_spec_obj_arr.push(spec_value)
                }

                if(pic_url !== undefined && pic_url != null){
                    value["pic_url"].push(pic_url);
                }
            }else {

                let goods_spec_obj_arr = [];

                if(goods_spec_name){

                    let value = {
                        goods_name: goods_spec_name,
                        spec_pic: pic_url
                    }

                    if(color){
                        value["color"] = color;
                    }

                    goods_spec_obj_arr.push(value)
                }

                let attr_value = {"goods_spec_obj_arr":goods_spec_obj_arr};

                if(pic_url !== undefined && pic_url != null){

                    attr_value["pic_url"] = [pic_url];
                }

                let tags = [];

                for(let key in item){

                    if(key.startsWith("tag")){

                        tags.push(item[key])
                    }
                }
                attr_value["tags"] = tags;


                if(goods_price !== undefined && goods_price !== null && goods_price !== "undefined") attr_value["goods_price"] = goods_price;



                if(popularize_level !== undefined && popularize_level !== null && popularize_level !== "undefined") attr_value["popularize_level"] = popularize_level;


                if(first_class !== undefined && first_class !== null && first_class !== "undefined") attr_value["big_category"] = first_class;


                if(second_class !== undefined && second_class !== null && second_class !== "undefined") attr_value["small_category"] = second_class;

                if(sex !== undefined && sex !== null && sex !== "undefined") attr_value["sex"] = sex;

                if(product_season !== undefined && product_season !== null && product_season !== "undefined") attr_value["product_season"] = product_season;

                if(goods_brand !== undefined && goods_brand !== null && goods_brand !== "undefined") attr_value["brand_name"] = goods_brand;


                map.set(goods_name,attr_value);
            }
        }
    })



    logger.info(`handle_goods_distinct count:${[...map.keys()].length}`)

    return map

}

async function handle_goods(result_map,head_office_id,uid) {


    for (let [goods_name,values] of result_map.entries()) {



        goods_name = goods_name.replace(/^\s+|\s+$/g,"")

        const find_goods_query = {"data.name":goods_name,"data.head_office_id":head_office_id,"data.state":0}

        let find_goods = await model_util.find_one_doc_from_Data('goods',find_goods_query);

        if(find_goods && Object.keys(find_goods).length >0) { // 存在该商品


            for(let spec_value of values){

                spec_value = spec_value.replace(/^\s+|\s+$/g,"")

                const find_goods_spec_query = {"data.goods_id":find_goods.id,"data.spec1_value":spec_value};

                let find_goods_spec = await  model_util.find_one_doc_from_Data('goods_spec',find_goods_spec_query);

                if(!find_goods_spec || Object.keys(find_goods_spec).length <=0){ // 新建

                    const  spec_item = {"spec1_name":"颜色","spec1_value":spec_value,"spec2_name":"","spec2_value":"","spec3_name":""}

                    await save_goods_spec(find_goods.id,head_office_id,spec_value,spec_item,uid,goods_name)
                }

            }

        }else {

            let save_data = await save_goods(goods_name,head_office_id,uid)

            await Promise.map(values,async spec_value =>{

                // 创建规格
                const  spec_item = {"spec1_name":"颜色","spec1_value":spec_value,"spec2_name":"","spec2_value":"","spec3_name":"","spec3_value":""}

                await save_goods_spec(save_data.id,head_office_id,spec_value,spec_item,uid,goods_name)
            })
        }

    }

}


async function save_goods_spec(good_id,head_office_id,goods_spec_name,spec_item,uid,goods_name) {

    try{

        // 创建商品规格

        const spec_key = await Keygen.issuePromise();

        let  default_goods_spec = new Data('goods_spec')()

        default_goods_spec._id = spec_key;
        default_goods_spec.id = spec_key;
        default_goods_spec.uid = uid;

        spec_item['goods_id'] =good_id;
        spec_item['head_office_id'] = head_office_id;
        spec_item['spec_number'] = 0;
        spec_item['goods_name'] = goods_name;

        default_goods_spec.data = spec_item;

        return await default_goods_spec.save();


    }catch (e){

        logger.error(`/zhmd/skq/goods_export.json save_goods_spec e:${e.message}`)

        throw e;

    }

}
async function save_goods(goods_name,head_office_id,uid) {

    try {

        const key = await Keygen.issuePromise();

        let  data = new Data('goods')();

        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = {

            "name":goods_name,
            "head_office_id":parseInt(head_office_id),
            "state":0
        };

        let save_data  = await data.save();

        // 创建默认规格

        const spec_key = await Keygen.issuePromise();

        let  default_goods_spec = new Data('goods_spec')();

        default_goods_spec._id = spec_key;
        default_goods_spec.id = spec_key;
        default_goods_spec.uid = uid;
        default_goods_spec.data = {

            "goods_id":save_data.id,
            "head_office_id":parseInt(head_office_id),
            "goods_name":goods_name,
            "spec_number":-1
        }

        await default_goods_spec.save();

        return save_data;

    }catch (e){

        logger.error(`/zhmd/skq/goods_export.json save_goods e:${e.message}`)

        throw e;
    }

}




async function save_goods_common(goods_name,head_office_id,uid,pic_url,tags,item_values) {

    try {

        const key = await Keygen.issuePromise();

        let  data = new Data('goods')();

        let data_value = {

            "name":goods_name,
            "head_office_id":parseInt(head_office_id),
            "state":0,
        };

        lodash.merge(data_value,item_values)

        delete  data_value.goods_spec_obj_arr

        delete  data_value.color


        data._id     = key;
        data.id      = key;
        data.uid     = uid;
        data.data    = data_value;

        let save_data  = await data.save();

        // 创建默认规格

        const spec_key = await Keygen.issuePromise();

        let  default_goods_spec = new Data('goods_spec')();

        default_goods_spec._id = spec_key;
        default_goods_spec.id = spec_key;
        default_goods_spec.uid = uid;
        default_goods_spec.data = {

            "goods_id":save_data.id,
            "head_office_id":parseInt(head_office_id),
            "goods_name":goods_name,
            "spec_number":-1
        }

        await default_goods_spec.save();

        return save_data;

    }catch (e){

        logger.error(`/zhmd/skq/goods_export.json save_goods e:${e.message}`)

        throw e;
    }

}






async function handle_excel_to_json_array(file) {

    const  temp_path = await global_util.mv_file_to_generate_tmp_path(file);

    let workbook = XLSX.readFile(temp_path);

    return excel_to_json(workbook);
}

function excel_to_json(workbook) {

    var result = {};
    const sheetName = workbook.SheetNames[0];

    const headers = ["brand","goods_number"];

    var roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{'header':headers,"range":1});

    if(roa.length > 0){
        result[sheetName] = roa;
    }

    return {result,sheetName};
}


router.post('/zhmd/common/goods_export.json', async (req,res,next) =>{

    try {

        let  {head_office_id,uid,header_index,goods_name_index,spec_name_index,brand_name_index,pic_url_index,tags_indexs,goods_price_index,popularize_level_index,first_class_index,second_class_index,sex_index,product_season_index,color_index} = req.body;

        if(!req.files){

            return global_util.errorRequest(req,res,Code.CHECK_MULTIPART);
        }
        let file = req.files.file;

        if(!file){
            return  global_util.errorRequest(req,res,Code.MISS_PARAMS,'file');
        }

        if(!uid){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'uid')
        }
        if(!head_office_id){

            return global_util.errorRequest(req,res,Code.MISS_PARAMS,'head_office_id');
        }

        if(global_util.isNotNumber(head_office_id)){

            return global_util.errorRequest(req,res,Code.PARAM_ERROR,'head_office_id')
        }

        header_index = header_index || 1;

        goods_name_index = goods_name_index || 0;

        head_office_id = global_util.parseIntThrowError(head_office_id);

        uid = global_util.parseIntThrowError(uid)

        //excel 数据转 json
        const {result,sheetName}  = await handle_excel_to_json_array_common(file,header_index,goods_name_index,spec_name_index,brand_name_index,pic_url_index,tags_indexs,goods_price_index,popularize_level_index,first_class_index,second_class_index,sex_index,product_season_index,color_index);



        // // json 数据去重
        let result_map =  handle_goods_distinct_common(result[sheetName])


        await handle_goods_common(result_map,head_office_id,uid);

        return global_util.jsonResponse(res,true,req)


    }catch (e){

        logger.error(`/zhmd/skq/goods_export.json e:${e.message}`);

        return global_util.errorRequest(req,res,e.message);
    }

})

async function handle_excel_to_json_array_common(file,header_index,goods_name_index,spec_name_index,brand_name_index,pic_url_index,tags_indexs,goods_price_index,popularize_level_index,first_class_index,second_class_index,sex_index,product_season_index,color_index) {


    const  temp_path = await global_util.mv_file_to_generate_tmp_path(file);

    let workbook = XLSX.readFile(temp_path);

    return excel_to_json_common(workbook,header_index,goods_name_index,spec_name_index,brand_name_index,pic_url_index,tags_indexs,goods_price_index,popularize_level_index,first_class_index,second_class_index,sex_index,product_season_index,color_index);
}


function excel_to_json_common(workbook,header_index,goods_name_index,spec_name_index,brand_name_index,pic_url_index,tags_indexs,goods_price_index,popularize_level_index,first_class_index,second_class_index,sex_index,product_season_index,color_index) {


    var result = {};
    const sheetName = workbook.SheetNames[0];

    var roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{'header':1,"range":header_index});


    if(tags_indexs != undefined){

        tags_indexs = global_util.splite_string_to_array(tags_indexs,',')

    }

    const result_array = [];

    roa.map((item) =>{

        let result_json = {}

        if(goods_name_index != undefined && global_util.isNumber(goods_name_index))  result_json["goods_name"] = item[goods_name_index]

        if(spec_name_index != undefined && global_util.isNumber(spec_name_index)) result_json["goods_spec_name"] = item[spec_name_index];

        if(brand_name_index != undefined && global_util.isNumber(brand_name_index)) result_json["goods_brand"] = item[brand_name_index];

        if(pic_url_index != undefined && global_util.isNumber(pic_url_index)) result_json["pic_url"] = item[pic_url_index];


        if(goods_price_index != undefined && global_util.isNumber(goods_price_index)) result_json["goods_price"] = item[goods_price_index]

        if(popularize_level_index != undefined && global_util.isNumber(popularize_level_index)) result_json["popularize_level"] = item[popularize_level_index];

        if(first_class_index != undefined && global_util.isNumber(first_class_index)) result_json["first_class"] = item[first_class_index];

        if(second_class_index != undefined && global_util.isNumber(second_class_index)) result_json["second_class"] = item[second_class_index];

        if(sex_index != undefined && global_util.isNumber(sex_index)) result_json["sex"] = item[sex_index];

        if(product_season_index != undefined && global_util.isNumber(product_season_index)) result_json["product_season"] = item[product_season_index];

        if(color_index != undefined && global_util.isNumber(color_index)) result_json["color"] = item[color_index];

        if(tags_indexs != undefined){

            for(let tag_index of tags_indexs){

                result_json[`tag${pic_url_index}`] = item[tag_index];
            }
        }
        result_array.push(result_json)

    })

    if(roa.length > 0){
        result[sheetName] = result_array;
    }
    return {result,sheetName};
}


async function handle_goods_common(result_map,head_office_id,uid) {



    for (let [goods_name,item_values] of result_map.entries()) {


        if(Array.isArray(item_values.goods_spec_obj_arr)){

            let array = [];

            for(let item of item_values.goods_spec_obj_arr){

                if(item.goods_name.indexOf('/') !== -1){

                    item.goods_name.split('/').map(function (spec_name) {

                        let obj = {};
                        Object.assign(obj,item)

                        delete  obj.goods_name

                        obj["goods_name"] = spec_name;

                        array.push(obj)
                    })

                }else {

                    array.push(item);
                }
            }
            item_values.goods_spec_obj_arr = array;

        }

        let picurl = item_values.pic_url;

        let tags = item_values.tags;

        goods_name = goods_name.replace(/^\s+|\s+$/g,"")

        const find_goods_query = {"data.name":goods_name,"data.head_office_id":head_office_id,"data.state":0}

        let find_goods = await model_util.find_one_doc_from_Data('goods',find_goods_query);

        if(find_goods && Object.keys(find_goods).length >0) { // 存在该商品

            let doc = {};

            if(picurl){

                doc["$addToSet"] = {"data.title_pics":{"$each": picurl}};
            }

            let set_value = {"data.tags":tags}

            lodash.merge(set_value,item_values)

            delete  set_value.goods_spec_obj_arr

            delete  set_value.color

            delete  set_value.pic_url

            for(let key of Object.keys(set_value)){

                if(key.indexOf("data.") === -1){

                    set_value[`data.${key}`] = set_value[key]

                    delete  set_value[key]
                }
            }

            doc["$set"] = set_value;

            await Data("goods").update({"id":find_goods.id},doc).exec()

            for(let spec_item of item_values.goods_spec_obj_arr){
                let  {goods_name: spec_value,spec_pic,color} = spec_item;

                spec_value = spec_value.replace(/^\s+|\s+$/g,"")

                const find_goods_spec_query = {"data.goods_id":find_goods.id,"data.spec1_value":spec_value};

                let find_goods_spec = await  model_util.find_one_doc_from_Data('goods_spec',find_goods_spec_query);

                if(!find_goods_spec || Object.keys(find_goods_spec).length <=0){ // 新建

                    const  spec_item = {"spec1_name":"颜色","spec1_value":spec_value,"spec2_name":"","spec2_value":"","spec3_name":""};

                    if(spec_pic != undefined && spec_pic != null){

                        spec_item["spec_pic"] = spec_pic;
                    }

                    if(color){
                        spec_item["color"] = color;
                    }

                    await save_goods_spec(find_goods.id,head_office_id,spec_value,spec_item,uid,goods_name)
                }else{ //修改

                    let data = {};

                    let doc = {'$set':data};

                    if(color){

                        data["data.color"] = color;
                    }

                    if(spec_pic !== undefined && spec_pic != null){

                        data['data.spec_pic'] = spec_pic
                    }

                    await Data('goods_spec').update({'id': find_goods_spec.id},doc);
                }
            }
        }else {

            let save_data = await save_goods_common(goods_name,head_office_id,uid,picurl,tags,item_values)


            await Promise.map(item_values.goods_spec_obj_arr,async spec_item =>{

                const {goods_name: spec_value,spec_pic,color} = spec_item;
                // 创建规格
                const  spec_item_data = {"spec1_name":"颜色","spec1_value":spec_value,"spec2_name":"","spec2_value":"","spec3_name":"","spec3_value":""};

                if(color){

                    spec_item_data["color"] = color;
                }

                if(spec_pic != undefined && spec_pic != null){

                    spec_item_data["spec_pic"] = spec_pic;
                }



                await save_goods_spec(save_data.id,head_office_id,spec_value,spec_item_data,uid,goods_name)
            })
        }
    }
}

module.exports = router
