/**
 * Created by wuxueyu on 17/8/8.
 */
const  router = require("express").Router({mergeParams:true})

const skq_goods_exports = require('./util_skq_goods_exports')

const customer_flow = require('./customer_flow')

const holiday = require('./holiday')

const sensor_report = require('./sensor_report')

const experience_time = require('./experience_time')


// 加载斯凯奇商品数据导入路由
router.use(skq_goods_exports)

router.use(holiday)

router.use(customer_flow.router)

router.use(sensor_report)

router.use(experience_time.router)

module.exports = router

