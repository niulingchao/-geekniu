/**
 * Created by yuanyuan on 17/9/19.
 */
const redis     = require("redis");
const bluebird  = require('bluebird');
const config    = require('../../config.json');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

class RedisClient{
    constructor(host,port){
        this.host = host;
        this.port = port;

        var options = {
            host: host,
            port: port,
            retry_strategy: function (options) {
                if(options.error && options.error.code == 'ECONNREFUSED'){
                    //logger.info('Redis connection to ' + host + ':' + port + ' failed,The server refused the connection');
                    return new Error('The server refused the connection');
                }
                if (options.total_retry_time > 1000 * 1) {
                    // End reconnecting after a specific timeout and flush all commands with a individual error
                    return new Error('Retry time exhausted');
                }
                if (options.times_connected > 2) {
                    // End reconnecting with built in error
                    return undefined;
                }
                // reconnect after
                return Math.max(options.attempt * 200, 500);
            }
        };

        return redis.createClient(options);
    }
}



module.exports.RedisClient = new RedisClient(config.redis_queue.host,config.redis_queue.port);

