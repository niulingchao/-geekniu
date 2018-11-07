/**
 * Created by wuxueyu on 17/7/24.
 */



class ZHMDCollector {

    constructor (app) {
        this.app = app || null

        try {
            this.validEnv()
        } catch (err) {
            console.error(`Failed to start plugin <Log Collector>: ${err.toString()}`)
        }
    }
    start () {

        const  router = require('./routers')
        this.app.use(router)
    }
    stop () {
        console.log('Plugin <Log Collector> stopped')
    }


    validEnv () {
        if (!this.app) throw new Error('invalid param <app>')
    }
}

module.exports = ZHMDCollector
