package store.wonderfulcollection.admin

import android.app.Application
import store.wonderfulcollection.admin.di.ServiceLocator

class WonderfulAdminApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.apiClient.attachTokenStorage(this)
        val apiBaseUrl = if (BuildConfig.DEBUG) {
            "http://10.0.2.2:3000/api"
        } else {
            "https://wonderfulcollection.store/api"
        }
        ServiceLocator.apiClient.updateBaseUrl(apiBaseUrl)
    }
}
