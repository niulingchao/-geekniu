/*
    此文件在slayer 包上更改而成,为了方便使用,优化其中无用代码,故重新编辑这个包
*/
'use strict';

var Factory = require('./lib/core.js');

Factory.Slayer.prototype.fromArray = require('./lib/readers/array.js');

module.exports = Factory;

