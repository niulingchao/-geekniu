/**
 * Created by yuanyuan on 17/9/19.
 */
const RedisClient = require('../model/redisClient').RedisClient;
const config      = require('../../config.json');
const request     = require('request');
async function insert_msg(msg_data) {
    const queue = msg_data.server_ipad_token;
    if(msg_data.pre_cursor === null){
        //await remove_queue_head(queue);
        await insert_queue_end(msg_data);
        await manage_msg(msg_data.msg_body);
        await loop_msg(queue);
    }else{
        const is_match = await is_match_queue_head(msg_data);
        if(is_match){
            await remove_queue_head(msg_data.server_ipad_token);
            await insert_queue_head(msg_data);
            await manage_msg(msg_data.msg_body);
            await loop_msg(queue);
        }else{
            const pre_cursor_msg = await get_msg_data_by_cursor_pre(msg_data);
            if(pre_cursor_msg === null){
                await insert_queue_end(msg_data);
            }else{
                await insert_msg_data_after(msg_data,pre_cursor_msg);
                await sort_all_msg_data(queue);
            }

            await check_queue(queue);
        }
    }
}

async function loop_msg(queue) {
    const queue_head_msg_str    = await RedisClient.lindexAsync(queue,'0');
    const queue_second_msg_str  = await RedisClient.lindexAsync(queue,'1');

    if(queue_head_msg_str && queue_second_msg_str){
        const queue_head_msg    = parse_msg_data(queue_head_msg_str);
        const queue_second_msg  = parse_msg_data(queue_second_msg_str);

        if(queue_head_msg.cursor === queue_second_msg.pre_cursor){
            await remove_queue_head(queue);
            await manage_msg(queue_second_msg.msg_body);
            await loop_msg(queue);
        } else {
            await check_queue(queue);
        }
    }
}

async function sort_all_msg_data(queue) {
    const msg_datas = await RedisClient.lrangeAsync(queue,'0','-1');

    const msg_data_array = msg_datas.map(item => parse_msg_data(item));

    for(let i = 0;i < msg_data_array.length;i ++){
        for(let j = 0;j < msg_data_array.length - 1;j ++){
            if(msg_data_array[i].pre_cursor === msg_data_array[j].cursor){
                let temp = msg_data_array[i];
                msg_data_array[i] = msg_data_array[j + 1];
                msg_data_array[j + 1] = temp;
            }

        }
    }
    for(let i = 0;i < msg_data_array.length;i++){
        await RedisClient.lsetAsync(queue,i + '',JSON.stringify(msg_data_array[i]));
    }
}

async function insert_msg_data_after(msg_data,pre_cursor_msg) {
    const queue = msg_data.server_ipad_token;
    await RedisClient.linsertAsync(queue,'after',JSON.stringify(pre_cursor_msg),msg_data.toString());
}

async function get_msg_data_by_cursor_pre(msg_data) {
    const queue     = msg_data.server_ipad_token;
    const msg_datas = await RedisClient.lrangeAsync(queue,'0','-1');
    for(let msg_data_single_str of msg_datas){
        const msg_data_single = parse_msg_data(msg_data_single_str);
        if(msg_data_single.cursor === msg_data.pre_cursor){
            return msg_data_single;
        }
    }

    return null;
}

async function remove_queue_head(queue) {
    await RedisClient.lpopAsync(queue);
}

async function is_match_queue_head(msg_data) {
    const queue = msg_data.server_ipad_token;
    const head_msg_data_str = await RedisClient.lindexAsync(queue,'0');
    const head_msg_data = parse_msg_data(head_msg_data_str);
    if (!head_msg_data) {
        return false;
    }
    return msg_data.pre_cursor === head_msg_data.cursor;
}

async function insert_queue_head(msg_data) {
    const queue = msg_data.server_ipad_token;
    await RedisClient.lpushAsync(queue,msg_data.toString());
}

async function insert_queue_end(msg_data) {
    const queue = msg_data.server_ipad_token;
    await RedisClient.rpushAsync(queue,msg_data.toString());
}

function parse_msg_data(msg_data_str) {
    return JSON.parse(msg_data_str);
}

async function check_queue(server_ipad_token) {
    let len = await RedisClient.llenAsync(server_ipad_token);
    let first = await RedisClient.lindexAsync(server_ipad_token,0) ;
    let data = JSON.parse(first);
    let timeSeparate = Date.now() - parseInt(data.timestamp);

    if (timeSeparate > config.queue_first_data_expire_time*1000 || len > config.queue_max_count) {
        await RedisClient.ltrimAsync(server_ipad_token,1,-1);

        await loop_msg(server_ipad_token);
    }
}

async function manage_msg(msg) {
    const url = config.call_back_url;
    let body = {'sensor_items' : msg };
    return new Promise(function (resolve,reject) {
        request({
            url,
            method: 'POST',
            body: body,
            json: true,
            headers: {
                'Content-type': 'application/json'
            }
        },function (err,res,body) {
            if(err) return reject(err);

            return resolve(body);
        })
    });

}

module.exports = insert_msg;