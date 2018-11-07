/**
 * Created by yuanyuan on 17/9/21.
 */
const fs = require('fs');
const lodash = require('lodash');

function update_config(new_config) {
    let config = require('../../config.json');

    config = lodash.merge(config,new_config);
    fs.writeFileSync('./node_modules/@geekniu/message_protocol/config.json',JSON.stringify(config));
}


module.exports = update_config;