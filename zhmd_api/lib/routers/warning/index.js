/**
 * Created by wuxueyu on 17/8/14.
 */

const  router = require("express").Router({mergeParams:true});

const power_warning = require('./power_warning');
const goods_warning = require('./goods_warning');

// 加载斯凯奇商品数据导入路由
router.use(power_warning.router);
router.use(goods_warning);

module.exports = router;