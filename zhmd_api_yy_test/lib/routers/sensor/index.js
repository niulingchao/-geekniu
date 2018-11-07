/**
 * Created by wuxueyu on 17/9/15.
 */

const  router = require("express").Router({mergeParams:true});

const sensor_report = require('./sensor_report');

const sensor_bind = require('./sensor_bind')

router.use(sensor_report.router);

router.use(sensor_bind)


module.exports = router;