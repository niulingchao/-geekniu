/**
 * Created by yuanyuan on 17/10/30.
 */
const map = new Map();

function reset_task(key,time,fn,fn_param) {
    if(map.has(key)){
        clearInterval(map.get(key));
    }

    const value = setInterval(async function () {
        await fn(fn_param);
    },time);

    map.set(key,value);
}



module.exports.reset_task = reset_task;