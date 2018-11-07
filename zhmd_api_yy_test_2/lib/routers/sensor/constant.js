/**
 * Created by wuxueyu on 17/3/15.
 */
const Constant = {};


Constant.SENSOR_USE_TYPE = {
    SENSOR_USE_TYPE_EXPERIENCE            : 0, //传感器使用用途  互动体验
    SENSOR_USE_TYPE_CROWD                 : 103, //客流
    SENSOR_USE_TYPE_CROWD_THROUGH         : 104, // 经过客流
};

Constant.SENSOR_DATA_TYPE = {
    SENSOR_DATA_TYPE_PICK_UP             :2, // 拿起
    SENSOR_DATA_TYPE_DOWN                :1, // 放下
    SENSOR_DATA_TYPE_INFRARED            :3, //红外
    SENSOR_DATA_TYPE_SPORT               :5, //运动
}
Constant.SENSOR_REPORT_TYPE = {

    SENSOR_REPORT_TYPE_SENSOR_REPORT          :"sensor_report",
    SENSOR_REPORT_TYPE_EXPERIENCE_TIME_REPORT :"experience_time_report",
    SENSOR_REPORT_TYPE_CROWD_REPORT           :"crowd_report",
    SENSOR_REPORT_TYPE_CROWD_THROUGH_REPORT   :"crowd_through_report"

}














module.exports = Constant;