/**
 * Created by wuxueyu on 17/8/9.
 */
const  router = require("express").Router({mergeParams:true})

const sensor_state = require('./sensor_state')

// 加载斯凯奇商品数据导入路由
router.use(sensor_state)

module.exports = router;

