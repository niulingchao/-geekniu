/**
 * Created by yuanyuan on 17/10/30.
 */
const ZHMDCollector     = require('../../index');
const log4js            = ZHMDCollector.getConfig().log4js;
const logger            = log4js.log4js.getLogger('service');

async function get_lock(client,key,timeout) {
    try{
        if(!timeout){
            timeout = 5;
        }

        const res = await client.SETNXAsync(key,1);
        if(res){
            await client.EXPIREAsync(key,timeout);
        }else{
            await setTimeoutPromise(1000);
            await get_lock(client,key,timeout);
        }
    }catch (e){
        logger.error(`redis_lock get_lock error,e = ${e.toString()} ,key = ${key}`);
        await client.delAsync(key);
    }
}

function setTimeoutPromise(timeout) {
    return new Promise(function (resolve,reject) {
        setTimeout(function () {
            resolve(true);
        },timeout)
    })
}



async function unlock(client,key) {
    try{
        await client.DELAsync(key);
    }catch (e){
        logger.error(`redis_lock unlock error,e = ${e.toString()} ,key = ${key}`);
    }
}


module.exports = {
    get_lock,unlock
};