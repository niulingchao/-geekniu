/**
 * Created by wuxueyu on 17/9/14.
 */
const model_util = require('../../common/model_util')
const Constant = require('./constant');
const ZHMDCollector = require('../../index')
const Event_data_handle = require('./event_data_handle')
const process = require('process')
const Redis_queue = require(process.cwd() + "/analysis/lib/redis_event_queue")
const lodash = require('lodash')
const Config = ZHMDCollector.getConfig();
const queue_name = Config.baas_config.analysis_config.analysis_redis_queue_event_name;
const local_port = Config.baas_config.env.production.port
const Holidays = require(process.cwd() + "/lib/chinese_holiday.js")
const log4js = ZHMDCollector.getConfig().log4js;
const logger = log4js.log4js.getLogger('service');
const request_promise = require("request-promise")
const calculate_experience_time = require("../util/experience_time").calculate_experience_time
const Promise = require("bluebird")

const crowd_experience = require('../experience_crowd/experience_anti_crowd');

const Sensor_event_report = {};

// 传感器上报 事件入库
Sensor_event_report.sensor_event_report = async(sensor, shop_id, data_type, uid, timestamp,experience_duration) => {

    try {

        let use_type = sensor.data.use_type
        if (use_type === Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_EXPERIENCE) { // 商品体验

            const query =
                {
                    "data.goods_id": sensor.data.goods_id,
                    "data.shop_id": sensor.data.shop_id,
                    "data.goods_spec_id": sensor.data.goods_spec_id
                }

            let goods_map = await model_util.find_one_doc_from_Data('goods_map', query);

            const event_names = [Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_SENSOR_REPORT];

            if ([Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_DOWN, Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_PICK_UP].indexOf(data_type) > -1 && experience_duration !== "no_experience_duration") {

                event_names.push(Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_EXPERIENCE_TIME_REPORT)
            }
            await Promise.map(event_names, async(event_name) => {

                let event_data = await sensor_report_of_experience_event_attr(event_name, sensor, goods_map, data_type, shop_id, uid, timestamp,experience_duration)

                logger.info(`sensor_event_report 构建事件数据<体验> ${JSON.stringify(event_data)}`);
                if (await  crowd_experience.get_one_shop(shop_id) && data_type == Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_PICK_UP) {
                    await crowd_experience.handle_experience(shop_id, timestamp, event_data);
                } else {
                    await Redis_queue.send_event_data(queue_name, event_data);
                }
            })
        } else if (use_type == Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_CROWD || use_type == Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_CROWD_THROUGH) { // 客流  / 经过客流

            let event = Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_CROWD_THROUGH_REPORT

            if (use_type == Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_CROWD) {

                event = Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_CROWD_REPORT

            }
            let event_data = await sensor_report_of_crowd_event_attr(event, sensor, uid, shop_id, timestamp)

            if (use_type == Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_CROWD) {
                logger.info(`sensor_event_report 构建事件数据<客流-进店> ${JSON.stringify(event_data)}`)
            }else{
                logger.info(`sensor_event_report 构建事件数据<客流-经过> ${JSON.stringify(event_data)}`)
            }

            if (await  crowd_experience.get_one_shop(shop_id) && use_type == Constant.SENSOR_USE_TYPE.SENSOR_USE_TYPE_CROWD) {
                await crowd_experience.handle_crowd(shop_id,timestamp,event_data)
            }else{
                await Redis_queue.send_event_data(queue_name, event_data);
            }


        } else { // 不支持 ，后续扩展类型

        }

    } catch (e) {

        logger.error(`sensor_event_report e:${e.message}`)

        throw  e;

    }
}

// 获取商品体验上报的事件属性
const sensor_report_of_experience_event_attr = async (event, sensor, goods_map, data_type, shop_id, uid, timestamp,experience_duration) => {

    try {

        let copy_show_case_id;

        if(!goods_map){
            goods_map = {"data":{}}
        }


        // 判断是智能货架模式 还是智能标签 模式
        if (sensor.data.bind_show_case_id > 0) { // 如果是智能货架

            copy_show_case_id = sensor.data.bind_show_case_id;
        } else { // 否则是智能标签

            copy_show_case_id = goods_map.data.show_case_id;
        }

        let plan_show_case_query = {"data.show_case_id":copy_show_case_id}

        let plan_show_case = await model_util.find_one_doc_from_Data('plan_show_case',plan_show_case_query)

        if(!plan_show_case || Object.keys(plan_show_case).length <=0){

            plan_show_case = {"data":{}}
        }


        let sensor_report_attr_of_db = {

            "attr_from_db": [

                {
                    "copy_id": sensor.id,
                    "data_name": "sensor",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.mac_address",
                            "field_type": "string",
                            "field_key": "mac_address"
                        },
                        {
                            "value_key": "data.use_type",
                            "field_type": "int",
                            "field_key": "use_type"
                        },
                        {
                            "value_key": "data.name",
                            "field_type": "string",
                            "field_key": "sensor_name"
                        },
                        {
                            "value_key": "data.server_ipad_token",
                            "field_type": "string",
                            "field_key": "server_ipad_token"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "sensor_id"
                        }
                    ]
                },
                {
                    "copy_id": goods_map.data.goods_id,
                    "data_name": "goods",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.name",
                            "field_type": "string",
                            "field_key": "goods_name"
                        },
                        {
                            "value_key": "data.tags",
                            "field_type": "array",
                            "field_key": "goods_tags"
                        },
                        {
                            "value_key": "data.title_pics",
                            "field_type": "array",
                            "field_key": "goods_title_pics"
                        },
                        {
                            "value_key": "data.price",
                            "field_type": "float",
                            "field_key": "goods_price"
                        },
                        {
                            "value_key": "data.brand_id",
                            "field_type": "long",
                            "field_key": "brand_id"
                        }, {
                            "value_key": "data.state",
                            "field_type": "int",
                            "field_key": "goods_state"
                        },
                        {
                            "value_key": "data.brand_name",
                            "field_type": "string",
                            "field_key": "brand_name"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "goods_id"
                        },
                        {
                            "value_key": "data.big_category",
                            "field_type": "string",
                            "field_key": "first_class"
                        },
                        {
                            "value_key": "data.small_category",
                            "field_type": "string",
                            "field_key": "second_class"
                        },
                        {
                            "value_key": "data.goods_price",
                            "field_type": "string",
                            "field_key": "goods_price"
                        },
                        {
                            "value_key": "data.sex",
                            "field_type": "string",
                            "field_key": "sex"
                        },
                        {
                            "value_key": "data.product_season",
                            "field_type": "string",
                            "field_key": "product_season"
                        },
                        {
                            "value_key": "data.popularize_level",
                            "field_type": "string",
                            "field_key": "popularize_level"
                        }

                    ]
                },

                {
                    "copy_id": sensor.data.shop_id,
                    "data_name": "shop",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.shop",
                            "field_type": "string",
                            "field_key": "shop"
                        },
                        {
                            "value_key": "data.shop_desc",
                            "field_type": "string",
                            "field_key": "shop_desc"
                        },
                        {
                            "value_key": "data.province",
                            "field_type": "string",
                            "field_key": "shop_province"
                        },
                        {
                            "value_key": "data.province_code",
                            "field_type": "string",
                            "field_key": "shop_province_code"
                        },
                        {
                            "value_key": "data.city",
                            "field_type": "string",
                            "field_key": "shop_city"
                        }, {
                            "value_key": "data.district",
                            "field_type": "string",
                            "field_key": "shop_district"
                        },
                        {
                            "value_key": "data.district_code",
                            "field_type": "string",
                            "field_key": "shop_district_code"
                        },
                        {
                            "value_key": "data.street",
                            "field_type": "string",
                            "field_key": "shop_street"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "shop_id"
                        },
                        {
                            "value_key": "data.coord",
                            "field_type": "array",
                            "field_key": "coord"
                        },
                        {
                            "value_key": "data.shop_pic",
                            "field_type": "string",
                            "field_key": "shop_pic"
                        },
                        {
                            "value_key": "data.head_office_id",
                            "field_type": "long",
                            "field_key": "head_office_id"
                        },
                        {
                            "value_key": "data.shop_pic",
                            "field_type": "string",
                            "field_key": "shop_pic"
                        },
                        {
                            "value_key": "data.region_id",
                            "field_type": "long",
                            "field_key": "region_id"
                        }

                    ]
                },

                {
                    "copy_id": copy_show_case_id,
                    "data_name": "show_case",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.name",
                            "field_type": "string",
                            "field_key": "show_case_name"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "show_case_id"
                        },
                        {
                            "value_key": "data.tags",
                            "field_type": "array",
                            "field_key": "show_case_tags"
                        }
                    ]
                },
                {
                    "copy_id": plan_show_case.data.plan_id,
                    "data_name": "plan",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.name",
                            "field_type": "string",
                            "field_key": "plan_name"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "plan_id"
                        },
                        {
                            "value_key": "data.image_url",
                            "field_type": "string",
                            "field_key": "plan_image_url"
                        }
                    ]
                },
                {
                    "copy_id": goods_map.data.goods_spec_id,
                    "data_name": "goods_spec",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "goods_spec_id"
                        },
                        {
                            "value_key": "data.spec1_name",
                            "field_type": "string",
                            "field_key": "spec1_name"
                        },
                        {
                            "value_key": "data.spec1_value",
                            "field_type": "string",
                            "field_key": "spec1_value"
                        },
                        {
                            "value_key": "data.spec2_name",
                            "field_type": "string",
                            "field_key": "spec2_name"
                        },
                        {
                            "value_key": "data.spec2_value",
                            "field_type": "string",
                            "field_key": "spec2_value"
                        },
                        {
                            "value_key": "data.spec3_name",
                            "field_type": "string",
                            "field_key": "spec3_name"
                        },
                        {
                            "value_key": "data.spec3_value",
                            "field_type": "string",
                            "field_key": "spec3_value"
                        },
                        {
                            "value_key": "data.spec_pic",
                            "field_type": "string",
                            "field_key": "spec_pic"
                        },

                        {
                            "value_key": "data.color",
                            "field_type": "string",
                            "field_key": "spec_color"
                        }

                    ]
                }




            ]
        }

        let sensor_type  = (data_type == Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_PICK_UP || data_type == Constant.SENSOR_DATA_TYPE.SENSOR_DATA_TYPE_DOWN ) ? 0 : 1 ;

        let sensor_report_attr_of_param = {
            "report_data_type": data_type,
            "report_shop_id": shop_id,
            "sensor_type":sensor_type
        }

        if (event == Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_EXPERIENCE_TIME_REPORT) {

            if(experience_duration >=0){

                let experience_frequency = 0;
                if(experience_duration  >=40000 && experience_duration <=1800000){
                    experience_frequency = 1;
                }
                let experience_obj =
                    {
                        "experience_duration": experience_duration,
                        "experience_frequency": experience_frequency
                    }
                sensor_report_attr_of_param = lodash.merge(sensor_report_attr_of_param, experience_obj)

            }else {

                let result = await calculate_experience_time(sensor.data.mac_address,data_type,timestamp)

                logger.info(`sensor_report_of_experience_event_attr calculate_experience_time result:${JSON.stringify(result)}`)

                let experience_obj =
                    {
                        "experience_duration": result.duration,
                        "experience_frequency": result.frequency
                    }
                sensor_report_attr_of_param = lodash.merge(sensor_report_attr_of_param, experience_obj)

            }

        }

        sensor_report_attr_of_db = await Event_data_handle.handle_from_db(sensor_report_attr_of_db);

        let event_attr = lodash.merge(sensor_report_attr_of_db, sensor_report_attr_of_param);

        let unique_uid = uid;

        return {unique_uid, uid, event, event_attr, timestamp}



    }catch (e){

        logger.error(`sensor_report_of_experience_event_attr e:${e.message}`);

        throw e;

    }


}

// 获取客流上报的事件属性
const sensor_report_of_crowd_event_attr = async(event, sensor, uid, shop_id, timestamp = new Date().getTime()) => {


    try {

        let weekDes = [
            '星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'
        ];

        let holiday = "";

        if(Holidays.isHoliday(timestamp)){

          let event_holiday = Holidays.event(timestamp);

          logger.info(`sensor_report_of_crowd_event_attr ${JSON.stringify(event_holiday)}`)

          if(event_holiday == undefined || event_holiday == null || Object.keys(event_holiday).length <= 0){
              holiday = "";
          }else {
              holiday = event_holiday.name || ""
          }
        }
        let sensor_report_attr_of_param = {

            "week": weekDes[new Date(timestamp).getDay()],
            "holiday": holiday
        }

        let weather_event_attr = await get_weather_event_attr(uid, shop_id);

        let sensor_report_attr_of_db = {

            "attr_from_db": [

                {
                    "copy_id": sensor.id,
                    "data_name": "sensor",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.mac_address",
                            "field_type": "string",
                            "field_key": "mac_address"
                        },
                        {
                            "value_key": "data.customer_flow_ration",
                            "field_type": "float",
                            "field_key": "customer_flow_ration"
                        }
                    ]
                },
                {
                    "copy_id": sensor.data.bind_show_case_id,
                    "data_name": "show_case",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.name",
                            "field_type": "string",
                            "field_key": "show_case_name"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": "show_case_id"
                        },
                        {
                            "value_key": "data.width",
                            "field_type": "float",
                            "field_key": "show_case_width"
                        }

                    ]
                },

                {
                    "copy_id": sensor.data.shop_id,
                    "data_name": "shop",
                    "schema": "data",
                    "fields": [
                        {
                            "value_key": "data.shop",
                            "field_type": "string",
                            "field_key": event == Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_CROWD_REPORT ? "shop" :"shop_name"
                        },
                        {
                            "value_key": "id",
                            "field_type": "long",
                            "field_key": event == Constant.SENSOR_REPORT_TYPE.SENSOR_REPORT_TYPE_CROWD_REPORT ? "id" : "shop_id"
                        },
                        {
                            "value_key": "data.head_office_id",
                            "field_type": "long",
                            "field_key": "head_office_id"
                        }
                    ]
                }

            ]


        }

        sensor_report_attr_of_db = await Event_data_handle.handle_from_db(sensor_report_attr_of_db);

        let event_attr = lodash.merge(lodash.merge(sensor_report_attr_of_param, weather_event_attr), sensor_report_attr_of_db)

        let unique_uid = uid;

        return {unique_uid, uid, event, event_attr, timestamp}

    }catch (e){

        logger.error(`sensor_report_of_crowd_event_attr e:${e.message}`);
        throw e;

    }

}

async function get_weather_event_attr(uid, shop_id) {

    try {

        let weather_result = await request_shop_weather(uid, shop_id);

        if (Array.isArray(weather_result) && weather_result.length > 0) {

            weather_result = weather_result[0];
        } else {
            weather_result = {};
        }
        let weather_fields = [

            {
                "value_key": "data.weather_obj.now.cond.txt",
                "field_type": "string",
                "field_key": "weather_txt"
            },
            {
                "value_key": "data.weather_obj.now.cond.code",
                "field_type": "string",
                "field_key": "weather_code"
            },
            {
                "value_key": "data.weather_obj.now.tmp",
                "field_type": "string",
                "field_key": "weather_tmp"
            }
        ]

        let weacher_event_attr_res = weather_fields.map((item) => {

            let field_key = item['field_key'];
            let field_type = item['field_type'];
            let value_key = item['value_key'];
            let value = lodash.get(weather_result, value_key) + '';
            let obj = {};
            obj[field_key] = value;
            return obj;
        }).reduce(function (a, b) {

            return lodash.merge(a, b);
        })

        return weacher_event_attr_res;


    } catch (e) {

        logger.error(`get_weather_event_attr e:${e.message}`)

        return {}

    }


}
async function request_shop_weather(uid, shop_id) {

    try {
        const body = {"shop_id":shop_id,"uid": uid}

        let options = {
            'url': `http://127.0.0.1:${local_port}/a/weather/find_or_fetch.json`,
            'method': 'POST',
            'json': true,
            'body': body
        }
        let result = await request_promise(options)

        if (result['error_code'] == 0) {
            return result["result"];
        } else {

            logger.error(`request_shop_weather error:${result['error_msg']}`)

        }
    } catch (e) {

        logger.error(`request_shop_weather error:${e.message}`)

    }
}


module.exports = Sensor_event_report;