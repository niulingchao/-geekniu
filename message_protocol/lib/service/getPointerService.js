const md5         = require('md5');
const config      = require('../../config.json');
const MsgData     = require('../model/msg_data');
const RedisClient = require('../model/redisClient').RedisClient;
const handle_msg  = require('./handle_msg');

async function getPointer(body) {
    let {pre_cursor,msg_body,server_ipad_token} = body;

    if (!msg_body || !server_ipad_token) {
        return false;
    }
    const hash = md5(JSON.stringify(msg_body));

    let exists = await RedisClient.existsAsync(hash);

    if(exists !== 1) {
        await RedisClient.setexAsync(hash,config.hash_pointer_expire_time,1);
        handle_msg(new MsgData(hash,pre_cursor,msg_body,server_ipad_token,Date.now()));
    }

    return hash;
}


module.exports = getPointer;