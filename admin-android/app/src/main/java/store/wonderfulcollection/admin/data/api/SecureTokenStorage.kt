package store.wonderfulcollection.admin.data.api

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureTokenStorage(context: Context) {
    private val prefs: SharedPreferences by lazy {
        var encrypted: SharedPreferences? = null
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            encrypted = EncryptedSharedPreferences.create(
                context,
                "wonderful_admin_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Throwable) {
            // Fallback to standard SharedPreferences if Keystore/EncryptedSharedPreferences fails on device/emulator
        }
        encrypted ?: context.getSharedPreferences("wonderful_admin_fallback_prefs", Context.MODE_PRIVATE)
    }

    fun saveToken(token: String?) {
        try {
            if (token.isNullOrBlank()) {
                prefs.edit().remove("admin_token").apply()
            } else {
                prefs.edit().putString("admin_token", token).apply()
            }
        } catch (e: Exception) {
            // Ignore write errors to prevent crashes
        }
    }

    fun getToken(): String? {
        return try {
            prefs.getString("admin_token", null)
        } catch (e: Exception) {
            null
        }
    }
}
