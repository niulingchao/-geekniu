
const  router = require("express").Router({mergeParams:true});

const exp_anti_crowd = require('./experience_anti_crowd');

router.use(exp_anti_crowd);

module.exports = router;