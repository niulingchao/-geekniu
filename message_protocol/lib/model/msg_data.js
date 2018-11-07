/**
 * Created by yuanyuan on 17/9/19.
 */
class MsgData{
    constructor(cursor,pre_cursor,msg_body,server_ipad_token,timestamp){
        this.cursor     = cursor;
        this.pre_cursor = pre_cursor;
        this.msg_body   = msg_body;
        this.server_ipad_token = server_ipad_token;
        this.timestamp  = timestamp;
    }

    toString(){
        return JSON.stringify({
            cursor      : this.cursor,
            pre_cursor  : this.pre_cursor,
            msg_body    : this.msg_body,
            server_ipad_token  : this.server_ipad_token,
            timestamp   : this.timestamp
        });
    }

}

module.exports = MsgData;