package store.wonderfulcollection.admin.presentation.reports

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.DashboardOverview

class ReportsActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var container: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { loadReports() }
        }

        val scroll = ScrollView(this)
        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        setupHeader()
        loadReports()
    }

    private fun setupHeader() {
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
            text = "  📈 Financial Reports"
            textSize = 22f
            setTextColor(0xFFDC2626.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)
        container.addView(headerRow)
    }

    private fun loadReports() {
        swipeRefresh.isRefreshing = true
        lifecycleScope.launch {
            ServiceLocator.getDashboardOverviewUseCase().onSuccess { d ->
                swipeRefresh.isRefreshing = false
                renderReports(d)
            }.onFailure {
                swipeRefresh.isRefreshing = false
                Toast.makeText(this@ReportsActivity, "Failed to load financial reports", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderReports(d: DashboardOverview) {
        while (container.childCount > 1) {
            container.removeViewAt(1)
        }

        // Card 1: Revenue Overview
        val card1 = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }
        val t1 = TextView(this).apply {
            text = "💰 Sales Revenue & Basket"
            textSize = 16f
            setTextColor(0xFF38BDF8.toInt())
            paint.isFakeBoldText = true
        }
        val b1 = TextView(this).apply {
            text = "• Gross Lifetime Revenue: ৳%,.2f\n• Completed Order Volume: %d\n• Average Basket Size: ৳%,.2f\n• Total Promo Discounts Issued: ৳%,.2f".format(
                d.grossRevenue, d.totalOrders, d.averageOrderValue, d.totalDiscounts
            )
            textSize = 14f
            setTextColor(0xFFF8FAFC.toInt())
            setPadding(0, 8, 0, 0)
            setLineSpacing(8f, 1f)
        }
        card1.addView(t1)
        card1.addView(b1)
        container.addView(card1)

        // Card 2: Dhanmondi Hub Performance
        val card2 = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }
        val t2 = TextView(this).apply {
            text = "🏬 Dhanmondi Hub Performance"
            textSize = 16f
            setTextColor(0xFF10B981.toInt())
            paint.isFakeBoldText = true
        }
        val b2 = TextView(this).apply {
            text = "• Express Deliveries (2-4h): Active & Optimized\n• Delivery Hub: House 42, Road 7/A, Dhanmondi, Dhaka\n• Top Payment Methods: Cash on Delivery, bKash, Nagad\n• Fulfillment Rate: 99.4%"
            textSize = 14f
            setTextColor(0xFFF8FAFC.toInt())
            setPadding(0, 8, 0, 0)
            setLineSpacing(8f, 1f)
        }
        card2.addView(t2)
        card2.addView(b2)
        container.addView(card2)
    }
}
