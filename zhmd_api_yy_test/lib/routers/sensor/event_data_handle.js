/**
 * Created by wuxueyu on 17/9/15.
 */

const Code   = require('../../common/error_code')
const  ZHMDCollector = require('../../index')
const  Data = ZHMDCollector.getModel().Data
const  User = ZHMDCollector.getModel().User;
const  Keygen  = ZHMDCollector.getModel().Keygen;
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  model_util   = require('../../common/model_util')
const  global_util = require('../../common/assists')
const lodash = require('lodash')
const path = require("path")
const moment = require("moment")
const process = require("process")
const Promise       = require('bluebird');



const Event_data_handle = {};

Event_data_handle.handle_from_db = async function(event_attr) {

    let db_result_obj = {};


    if(event_attr.hasOwnProperty('attr_from_db')){
        let attr_from_db = event_attr.attr_from_db;

        if(Array.isArray(attr_from_db) && attr_from_db.length > 0){

            await Promise.map(attr_from_db,async item => {
                let schema      = item['schema'];
                let data_name   = item['data_name'];
                let id     = item['copy_id'];
                let fields      = item['fields'];

                return await get_field_by_id(schema,data_name,id,fields);
            }).then(async result => {
                db_result_obj = result.reduce((a,b) => {
                    return lodash.merge(a,b);
                });
            })

        }else{
            logger.error(`handle_from_db parse attr_from_db not array,attr_from_db = ${attr_from_db} ,typeof attr_from_db = ${typeof attr_from_db}`);
        }
    }

    return db_result_obj;
}


async function get_field_by_id(schema,data_name,id,fields) {
    schema = schema.toLowerCase();

    let query = {'id': id};
    let result;

    switch (schema){
        case 'user':
            result = await User.findOne(query).exec();
            break;
        case 'data':
            result = await Data(data_name).findOne(query).exec();
            break;
    }

    if(result){
        let return_obj = fields.map(item => {
            let field_key  = item['field_key'];
            let field_type = item['field_type'];
            let value_key  = item['value_key'];
            let value      = convert_value_by_type(lodash.get(result,value_key),field_type);
            let obj        = {};
            obj[field_key] = value;
            return obj;
        }).reduce((a,b) => {
            return lodash.merge(a,b);
        });

        return return_obj;
    }else{
        logger.error(`get_field_by_id not found give id,id = ${id} ,schema = ${schema} ,data_name = ${data_name} ,fields = ${JSON.stringify(fields)}`);

        return {};
    }
}


function convert_value_by_type(value,type) {
    if(type && typeof type === 'string'){
        type = type.toLowerCase();

        switch (type){
            case 'string':
                if(value === undefined) value = ""
                value += '';
                break;
            case 'int':
                try{
                    value = parseInt(value);
                }catch (e) {
                    logger.error(`convert_value_by_type parseInt fail,value = ${value} ,typeof value = ${typeof value}`);
                }
                break;
            case 'float':
                try{
                    value = parseFloat(value);
                }catch (e) {
                    logger.error(`convert_value_by_type parseFloat fail,value = ${value} ,typeof value = ${typeof value}`);
                }
                break;
            case 'long':
                try{
                    value = new Number(value).valueOf();
                }catch (e) {
                    logger.error(`convert_value_by_type parseFloat fail,value = ${value} ,typeof value = ${typeof value}`);
                }
                break;
        }
    }

    return value;
}

module.exports = Event_data_handle;





