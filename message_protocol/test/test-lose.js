/**
 * Created by yuanyuan on 17/9/19.
 */
import test from 'ava';
const getPointerService = require('../lib/service/getPointerService');
const fs                = require('fs');
const config            = require('../config.json');
const sleep             = require('sleep');
const RedisClient       = require('../lib/model/redisClient').RedisClient;

const file_name  = "./test-lose.log";
const test_server_ipad_token = 'test_server_ipad_token_1';
const test_server_ipad_token2 = 'test_server_ipad_token_2';

test.before(async t => {
    const http = require('http');
    const url  = require('url');
    const port = 3000;
    const path = url.parse(config.call_back_url).pathname;
    await RedisClient.delAsync(test_server_ipad_token);
    await RedisClient.delAsync(test_server_ipad_token2);
    fs.writeFileSync(file_name,'');
    const server = http.createServer((req,res) => {
        const total = [];
        res.statusCode = 200;
        req.on('data',function (chunk) {
            total.push(chunk);
        });

        req.on('end',function () {
            const body = Array.from(total).toString();

            if(req.url === path){
                fs.appendFileSync(file_name,body + '\n');
            }
            res.setHeader('Content-Type', 'text/plain');
            res.end('Ok\n');
        });

    });

    server.listen(port,() => {
        console.log(`Server runnint at http://127.0.0.0.1:${port}`);
    })
});


test.after(async t => {
    // await RedisClient.delAsync(test_server_ipad_token);
    // await RedisClient.delAsync(test_server_ipad_token2);
    //fs.unlinkSync(file_name);
});


test('order-asc',async t => {
    //100次,25%的丢包率,间隔在4~8秒浮动
    const start_time = 1;
    const end_time   = 2;
    const percent    = 25;
    const total      = 10;
    const insert_array = [];
    const cursor_map  = new Map();
    const new_map = new Map();

    for(let i  = 0;i < total;i++){
        let time = random(start_time,end_time) * 1000;

        if(i === 0){
            cursor_map.set(i,null);
        }

        if(random(null,null,percent) || i === 0){
            console.log(`i = ${i}`);
            //insert
            const msg_body = [{
                'ipad_token': test_server_ipad_token,
                'msg' : 'msg' + '_' + i + '_' + new Date().getTime()
            }];
            const cursor = await getPointerService({pre_cursor: get_cursor(cursor_map,i),msg_body:msg_body,server_ipad_token: test_server_ipad_token});
            cursor_map.set(i+1,cursor);
            // const msg = await RedisClient.lrangeAsync(test_server_ipad_token,'0','-1');
            // console.log(`msg = ${msg}`);
            insert_array.push(msg_body[0]);
            console.log(`insert_array end = `);
            console.log(insert_array);
            new_map.set(i,true);

        }
        if (i!==0) {
            console.log(`i = ${i} ,new_map.has(i) = ${new_map.has(i)} ,!new_map.has(i -1 ) = ${!new_map.has(i -1 )}`);
            if(new_map.has(i) && !new_map.has(i -1 )){
                console.log('shift------------');
                const remvoe = insert_array.pop();
                console.log(remvoe);
            }
        }


        if(i === (total - 1)){
            const result = read_file_to_array();
            const queue_msg = await RedisClient.lrangeAsync(test_server_ipad_token,'0','-1');

            let tmp_arr = [];
            result.forEach(function (item) {
                if (item.includes('{') && item.includes('}'))
                    tmp_arr.push(JSON.parse(item).sensor_items[0]);
            });
            queue_msg.forEach(function (item, index) {
                if (index !==0 ) {
                    tmp_arr.push(JSON.parse(item).msg_body[0])
                }

            });

            console.log('======================================');
            console.log(insert_array)
            console.log('++++++++++++++++++++++++++++++++++++++')
            console.log(tmp_arr)
            if (JSON.stringify(insert_array)===JSON.stringify(tmp_arr)) {
                t.pass();
            }
        }

        sleep.msleep(time);
    }
});


// test('normal',async t => {
//     const start_time = 4;
//     const end_time   = 8;
//     //const percent    = 25;
//     const total      = 10;
//     const insert_array = [];
//     const cursor_map  = new Map();
//
//     for(let i  = 0;i < total;i++){
//         let time = random(start_time,end_time) * 1000;
//
//         if(i === 0){
//             cursor_map.set(i,null);
//         }
//
//         const msg_body = [{
//             'ipad_token': test_server_ipad_token2,
//             'msg' : 'msg' + '_' + i + '_' + new Date().getTime()
//         }];
//         const cursor = await getPointerService({pre_cursor: get_cursor(cursor_map,i),msg_body:msg_body,server_ipad_token: test_server_ipad_token2});
//         cursor_map.set(i+1,cursor);
//         insert_array.push(msg_body[0]);
//
//         if(i === (total - 1)){
//             const result = read_file_to_array();
//             const queue_msg = await RedisClient.lrangeAsync(test_server_ipad_token2,'0','-1');
//
//             let tmp_arr = [];
//             result.forEach(function (item) {
//                 if (item.includes('{') && item.includes('}'))
//                     tmp_arr.push(JSON.parse(item).sensor_items[0]);
//             });
//             queue_msg.forEach(function (item, index) {
//                 if (index !==0 ) {
//                     tmp_arr.push(JSON.parse(item).msg_body[0])
//                 }
//
//             });
//             if (JSON.stringify(insert_array)===JSON.stringify(tmp_arr)) {
//                 t.pass();
//             }
//         }
//
//         sleep.msleep(time);
//     }
// });


function read_file_to_array() {
    return fs.readFileSync(file_name,'utf8').split('\n');
}

function get_cursor(map,i) {
    if(map.get(i) === null){
        return map.get(i);
    }else if(typeof map.get(i) === 'undefined'){
        const random_value = 'ABCDEFG' + i;
        map.set(i,random_value);

        return random_value;
    }else{
        return map.get(i);
    }
}

function random(start,end,percent) {
    if(typeof start === 'number' && typeof end === 'number'){
        const value = parseInt(Math.random() * end);
        if(value >= start){
            return value;
        }else{
            return random(start,end);
        }
    }else if(typeof percent === 'number'){
        const value = parseInt(Math.random() * 100);
        if(value >= percent){
            return true;
        }else{
            return false;
        }
    }else{
        throw new Error('不支持的类型');
    }
}



