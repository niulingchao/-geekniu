/**
 * Created by wuxueyu on 17/9/8.
 */
const  router = require("express").Router({mergeParams:true})

const camers = require('./camers')

// 摄像头相关
router.use(camers)

module.exports = router;

