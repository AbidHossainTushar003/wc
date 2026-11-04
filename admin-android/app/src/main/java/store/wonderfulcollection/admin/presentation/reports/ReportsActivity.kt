package store.wonderfulcollection.admin.presentation.reports

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator

class ReportsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "📈 Financial & Sales Reports"
            textSize = 24f
            setTextColor(0xFFDC2626.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val reportView = TextView(this).apply {
            text = "Loading analytics..."
            textSize = 15f
            setTextColor(0xFFF8FAFC.toInt())
            setLineSpacing(12f, 1f)
        }
        container.addView(reportView)
        setContentView(scroll)

        lifecycleScope.launch {
            ServiceLocator.getDashboardOverviewUseCase().onSuccess { d ->
                reportView.text = """
                    📊 SALES REVENUE OVERVIEW:
                    • Gross Lifetime Revenue: ৳%,.2f
                    • Completed Order Volume: %d
                    • Average Basket Size: ৳%,.2f
                    • Total Promo Discounts Issued: ৳%,.2f
                    
                    🏬 DHANMONDI PERFORMANCE:
                    • Express Deliveries (2-4h): Active
                    • Delivery Hub: House 42, Road 7/A, Dhanmondi
                    • Top Payment Methods: Cash on Delivery, bKash, Nagad
                """.trimIndent().format(d.grossRevenue, d.totalOrders, d.averageOrderValue, d.totalDiscounts)
            }
        }
    }
}

