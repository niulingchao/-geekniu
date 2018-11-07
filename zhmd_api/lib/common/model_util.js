/**
 * Created by wuxueyu on 17/8/1.
 */

const  ZHMDCollector = require('../index')
const  Data = ZHMDCollector.getModel().Data
const  User = ZHMDCollector.getModel().User
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');

module.exports.find_docs_form_Data = async (table_name,query_conditions)=>{

    try {

        let docs = await Data(table_name).find(query_conditions).lean().exec();

        return docs;

    }catch (e){

        logger.error(`model_util find_docs_form_Data e:${e.message}`);

        throw e;
    }
}

module.exports.find_one_doc_from_Data = async (table_name,query_conditions) =>{

    try {

        let doc = await Data(table_name).findOne(query_conditions).lean().exec();

        return doc;

    }catch (e){

        logger.error(`model_util find_one_doc_from_Data e:${e.message}`);

        throw e;

    }
}

module.exports.find_one_user = async (conditons) =>{


    try {

        return await User.findOne(conditons).lean().exec();

    }catch (e){

        logger.error(`model_utilfind_one_user e:${e.message}`);
        throw e;

    }
}

module.exports.update_Data = async (table_name,query_conditions,doc,options) =>{

    try {

        let docs = await Data(table_name).update(query_conditions,{"$set":doc},options).exec();

        return docs;

    }catch (e){

        logger.error(`Util update_Data table_name:${table_name} query_conditions:${query_conditions} doc:${JSON.stringify(doc)} options:${JSON.stringify(options)} e:${e.message} `);

        throw e;
    }




}








