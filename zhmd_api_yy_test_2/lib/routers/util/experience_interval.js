/**
 * Created by yuanyuan on 17/12/6.
 */
const get_experience_interval = function (shop_id) {
    //Ecco专卖店的shop_id
    if(shop_id === 1539124600309962){
        return 3000;//3s
    }else {
        return 1100;//1.1s
    }

};















module.exports = {
    get_experience_interval
};