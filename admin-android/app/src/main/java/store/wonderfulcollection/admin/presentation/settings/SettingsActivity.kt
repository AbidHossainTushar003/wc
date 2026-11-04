package store.wonderfulcollection.admin.presentation.settings

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import store.wonderfulcollection.admin.di.ServiceLocator

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { isRefreshing = false }
        }

        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        // Header Row
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 24)
        }

        val btnBack = Button(this).apply {
            text = "← Back"
            textSize = 12f
            setBackgroundColor(0xFF1E293B.toInt())
            setTextColor(0xFF38BDF8.toInt())
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnBack)

        val title = TextView(this).apply {
            text = "  ⚙️ Store Configuration"
            textSize = 22f
            setTextColor(0xFFF97316.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)
        container.addView(headerRow)

        // API Endpoint Card
        val apiCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }

        val apiLabel = TextView(this).apply {
            text = "Backend API Endpoint URL:"
            setTextColor(0xFF94A3B8.toInt())
            textSize = 13f
        }
        apiCard.addView(apiLabel)

        val apiInput = EditText(this).apply {
            setText(ServiceLocator.apiClient.baseUrl)
            setTextColor(0xFFF8FAFC.toInt())
            setBackgroundColor(0xFF0F172A.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 12, 0, 16)
            layoutParams = lp
        }
        apiCard.addView(apiInput)

        val btnSaveApi = Button(this).apply {
            text = "Update API Connection"
            setBackgroundColor(0xFFF97316.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                val newUrl = apiInput.text.toString().trim()
                if (newUrl.isNotEmpty()) {
                    ServiceLocator.apiClient.baseUrl = newUrl
                    Toast.makeText(this@SettingsActivity, "API Base URL updated successfully!", Toast.LENGTH_SHORT).show()
                }
            }
        }
        apiCard.addView(btnSaveApi)
        container.addView(apiCard)

        // Store Profile & Merchant Accounts Card
        val profileCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }

        val profileTitle = TextView(this).apply {
            text = "🛍️ Store Profile & Merchant Hub"
            textSize = 16f
            setTextColor(0xFF38BDF8.toInt())
            paint.isFakeBoldText = true
        }
        profileCard.addView(profileTitle)

        val profileDesc = TextView(this).apply {
            text = """
                • Store Name: Wonderful Collection
                • Business Address: DHAKA, BANGLADESH
                • bKash Personal: 01560024777
                • Nagad Personal: 01560024777
                • Rocket Personal: 01560024777
                • Production cPanel: https://wonderfulcollection.store/api
                • Android Emulator Local: http://10.0.2.2:3000/api
            """.trimIndent()
            setTextColor(0xFFF8FAFC.toInt())
            textSize = 13f
            setPadding(0, 12, 0, 0)
            setLineSpacing(6f, 1f)
        }
        profileCard.addView(profileDesc)
        container.addView(profileCard)
    }
}
