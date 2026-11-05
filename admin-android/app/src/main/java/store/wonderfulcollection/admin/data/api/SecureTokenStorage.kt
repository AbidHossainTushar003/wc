package store.wonderfulcollection.admin.data.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureTokenStorage(context: Context) {
    private val prefs by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "wonderful_admin_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_GCM,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            context.getSharedPreferences("wonderful_admin_fallback_prefs", Context.MODE_PRIVATE)
        }
    }

    fun saveToken(token: String?) {
        if (token.isNullOrBlank()) {
            prefs.edit().remove("admin_token").apply()
        } else {
            prefs.edit().putString("admin_token", token).apply()
        }
    }

    fun getToken(): String? {
        return prefs.getString("admin_token", null)
    }
}
