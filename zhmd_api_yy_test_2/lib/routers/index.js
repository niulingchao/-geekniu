/**
 * Created by wuxueyu on 17/7/24.
 */

const router = require('express').Router();
const goods_router = require('./goods');
const assists  = require('../common/assists')
const show_case_coord_router = require('./show_case_coord')
const util = require('./util')
const device_manage = require('./device_manage')


const heat = require('./heat');

const warning = require('./warning')

const camera = require('./Camera/')

const sensor_report = require('./sensor')

const exp_anti_crowd = require('./experience_crowd');

const experience_percent_queue = require('./experience_percent_queue');

const sport_sensor = require('./sport_sensor/');

router.use(heat);

// 加载商品相关的路由
router.use(goods_router)
// 加载热力图相关路由
router.use(show_case_coord_router)

// 加载工具接口
router.use(util)

// 设备管理相关路由
router.use(device_manage)

// 告警相关路由
router.use(warning)

router.use(camera)

router.use(sensor_report)

router.use(exp_anti_crowd);

router.use(experience_percent_queue);

router.use(sport_sensor);

module.exports = router