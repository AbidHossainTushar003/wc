package store.wonderfulcollection.admin.presentation.settings

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator

class SettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "⚙️ Store Configuration"
            textSize = 24f
            setTextColor(0xFFF97316.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val apiLabel = TextView(this).apply {
            text = "Backend API Endpoint URL:"
            setTextColor(0xFF94A3B8.toInt())
            textSize = 13f
        }
        container.addView(apiLabel)

        val apiInput = EditText(this).apply {
            setText(ServiceLocator.apiClient.baseUrl)
            setTextColor(0xFFF8FAFC.toInt())
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(20, 20, 20, 20)
        }
        container.addView(apiInput)

        val btnSaveApi = Button(this).apply {
            text = "Update API Connection"
            setBackgroundColor(0xFFF97316.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                val newUrl = apiInput.text.toString().trim()
                if (newUrl.isNotEmpty()) {
                    ServiceLocator.apiClient.baseUrl = newUrl
                    Toast.makeText(this@SettingsActivity, "API Base URL updated!", Toast.LENGTH_SHORT).show()
                }
            }
        }
        container.addView(btnSaveApi)

        val infoTv = TextView(this).apply {
            text = """
                
                📌 DEFAULT CONNECTIVITY:
                • Production cPanel: https://wonderfulcollection.store/api
                • Android Emulator Local: http://10.0.2.2:3000/api
                • Local Physical Phone: http://<YOUR_PC_IP>:3000/api
                
                🛍️ STORE PROFILE:
                • Wonderful Collection
                • Dhanmondi Express Hub: Road 7/A, Dhaka-1209
                • bKash: 01712-345678
                • Nagad: 01812-345678
            """.trimIndent()
            setTextColor(0xFFCBD5E1.toInt())
            textSize = 14f
            setLineSpacing(8f, 1f)
            setPadding(0, 32, 0, 0)
        }
        container.addView(infoTv)

        setContentView(scroll)
    }
}

