# 本工程为Baas插件模板工程,模板工程需要遵守以下约定

### index.js
* 每个插件都要导出一个Class
* 每个Class必须拥有start和stop两个方法,分别表示启动与停止
* 每个Class的构造器中可使用Baas传入的所有值,其中包括配置文件或其它资源文件,是一个大Object类型,具体传入的值以Baas为准
* 每个Class可以有一个is_load_all_woker的静态方法，返回true or false,来判断是否让所有的worker加载插件
### 获取资源示例如下:
* 直接从构造器中获得的资源有(`以下资源均只读,不可修改`):
    * app.baas(它的属性如下)
        * config
            * baas_config(对应baas文件baas_config.json)
            * configManager
            * log4js
        * router
        * model
            * Data(Model)
            * Op(Model)
            * User(Model)
            * Keygen(Model)


### 如何创建一个插件工程?
  * git clone 本工程 到本地
  * rm -rf .git && rm package.json
  * npm init --scope="geekniu"
  * npm login --registry=http://101.200.205.189:7001
    * 用户名 : admin
    * 邮箱   : 791969680@qq.com
    * 密码   : 123456987a
  * npm publish --registry=http://101.200.205.189:7001

### Baas如何引用插件?
  * baas工程中的baas_config.json新增字段如下:
    * `plugins`: ["log-collector/someClass","electricity"]
    * 每个插件可以自定义导出功能,也可以只导出一个Class,Baas会根据上述的命名空间自动加载
    * `plugins`中的插件名不需要带@geekniu
  * baas工程的启动文件server.js中如下:
    ```
    const plugins = {};
    const plugin_instance = [];
    baas_config.plugins.forEach(name => {
        let klass = require(`@geekniu/${name.split('/')[0]}`);
        if(name.split('/')[1]){
            plugins[name] = klass[name.split('/')[1]]
        }else{
            plugins[name] = klass;
        }
    })

    Object.keys(plugins).forEach(key => {
        let instance = new plugins[key](app);
        plugin_instance.push(instance);
        instance.start();
    })

    process.on('exit',function(){
            Object.keys(plugin_instance).forEach(item => {item.stop();})
    })
    ```

### 共享的全局(global)方法
* 具体实现请参考Baas代码
* 响应http的方法: 用来打印日志及用来数据分析
    * global.jsonResponse = function (response, result,req)
    * global.jsonResponseNoWarp = function (response,result,req)
    * global.jsonResponseCustom = function (response,result,req)
    * global.jsonResponseCounter = function (response,result,total_count,req)
    * global.jsonResponseProopApi = function (response,result,req)
    * global.jsonResponseCombinedApi = function (response,result,total_count,req,middleResArr)
    * global.errorRequest = function (req,res, msg)
    * global.errorRequestForExtendApi = function (req,res, msg,middleResArr)
    * global.jsonResponseCustomForExtendsApi = function (response,result,req,middleResArr)

* 内部方法调用: set或get的方法都是async方法
    * global.set_inner_function = function (url_path,inner_function);
    * global.get_inner_function = function (url_path);