package store.wonderfulcollection.admin

import android.app.Application
import store.wonderfulcollection.admin.di.ServiceLocator

class WonderfulAdminApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize dependencies
        ServiceLocator.apiClient.baseUrl = "https://wonderfulcollection.store/api"
    }
}

