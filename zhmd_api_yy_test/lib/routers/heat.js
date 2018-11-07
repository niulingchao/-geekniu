const router = require('express').Router({mergeParams:true});
const  ZHMDCollector = require('../index');
const  Data = ZHMDCollector.getModel().Data;
const  log4js = ZHMDCollector.getConfig().log4js;
const  logger  = log4js.log4js.getLogger('service');
const  Keygen  = ZHMDCollector.getModel().Keygen;
const baas_config = ZHMDCollector.getConfig().baas_config;
const rp = require('request-promise');


const analysis_calculate_url = `${baas_config.analysis_config.analysis_server_url}analysis/util/calculate.json`;

const plan_heat_value = async(req,res)=>{
    try{
        const {heat_plan_id,start_time,end_time} = req.body;
        if (!heat_plan_id) return errorRequest(req,res,'plan_id不能为空');
        if (!start_time) return errorRequest(req,res,'start_time不能为空');
        if (!end_time) return errorRequest(req,res,'end_time不能为空');

        const plan_model = Data('plan');
        const plan_show_case_model = Data('plan_show_case');

        const plan = await plan_model.findOne({id:heat_plan_id}).lean();
        if(!plan) return errorRequest(req,res,'自定义平面图id不存在');
        if(plan.data.plan_type !== 10) return errorRequest(req,res,'plan_id不是自定义平面图的id');

        const sub_plan_ids = plan.data.sub_plans.map(data=>{
            return data.plan_ids;
        });

        const tasks = sub_plan_ids.map(plan_ids=>{
            return plan_ids.map(plan_id=>{
                return plan_show_case_model.find({'data.plan_id':plan_id});
            });
        });

        let show_case_ids = await Promise.all(tasks.map(task=>{
            return Promise.all(task);
        }));

        show_case_ids = show_case_ids.map(a_plans=>{
            return a_plans.map(a_plan=>{
                return a_plan.map(show_case=>{
                    return show_case.data.show_case_id;
                });
            }).reduce((a,b)=>{
                return a.concat(b);
            },[]);
        });

        const get_int_count = async(show_case_ids)=>{
            const options = {
                method: 'POST',
                uri: `${analysis_calculate_url}`,
                body: {
                    conditions:{"$and":[{"event_attr.show_case_id":{"$in":show_case_ids}},{"$or":[{"event_attr.sensor_type":1},{"event_attr.report_data_type":2}]}]},
                    batch:[{"result_key":"value","cal_param":"id","cal_function":"count"}],
                    start_time,
                    end_time,
                    schema_type:'event',
                    event:'sensor_report'
                },
                json: true
            };
            return rp(options);
        };

        const int_count_tasks = show_case_ids.map(show_case_ids=>{
            return get_int_count(show_case_ids)
        });
        let int_count_result = await Promise.all(int_count_tasks);
        int_count_result = int_count_result.map(v=>{
            return v.result.pop();
        });

        plan.data.sub_plans = plan.data.sub_plans.map((v,index)=>{
            v.heat = int_count_result[index] || {value:0};
            return v;
        });

        return jsonResponse(res,plan,req);
    }catch(err){
        return errorRequest(req,res,err.message);
    }
};

const preview_heat_value = async(req,res)=>{
    try{
        const {sub_plan_ids,start_time,end_time} = req.body;
        if (!start_time) return errorRequest(req,res,'start_time不能为空');
        if (!end_time) return errorRequest(req,res,'end_time不能为空');

        const plan_show_case_model = Data('plan_show_case');

        const tasks = sub_plan_ids.map(plan_ids=>{
            return plan_ids.map(plan_id=>{
                return plan_show_case_model.find({'data.plan_id':plan_id});
            });
        });

        let show_case_ids = await Promise.all(tasks.map(task=>{
            return Promise.all(task);
        }));

        show_case_ids = show_case_ids.map(a_plans=>{
            return a_plans.map(a_plan=>{
                return a_plan.map(show_case=>{
                    return show_case.data.show_case_id;
                });
            }).reduce((a,b)=>{
                return a.concat(b);
            },[]);
        });

        const get_int_count = async(show_case_ids)=>{
            const options = {
                method: 'POST',
                uri: `${analysis_calculate_url}`,
                body: {
                    conditions:{"$and":[{"event_attr.show_case_id":{"$in":show_case_ids}},{"$or":[{"event_attr.sensor_type":1},{"event_attr.report_data_type":2}]}]},
                    batch:[{"result_key":"value","cal_param":"id","cal_function":"count"}],
                    start_time,
                    end_time,
                    schema_type:'event',
                    event:'sensor_report'
                },
                json: true
            };
            return rp(options);
        };

        const int_count_tasks = show_case_ids.map(show_case_ids=>{
            return get_int_count(show_case_ids)
        });
        let int_count_result = await Promise.all(int_count_tasks);


        int_count_result = int_count_result.map(v=>{
            return v.result.pop() || {value:0};
        });


        return jsonResponse(res,int_count_result,req);
    }catch(err){
        return errorRequest(req,res,err.message);
    }
};

router.post('/zhmd_api/shop_plan/heat_value.json',plan_heat_value);
router.post('/zhmd_api/shop_plan/heat_value_preview.json',preview_heat_value);

module.exports = router;
