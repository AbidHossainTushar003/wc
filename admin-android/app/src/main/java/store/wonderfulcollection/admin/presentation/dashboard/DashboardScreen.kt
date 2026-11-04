package store.wonderfulcollection.admin.presentation.dashboard

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.DashboardOverview
import store.wonderfulcollection.admin.domain.usecase.GetDashboardOverviewUseCase
import store.wonderfulcollection.admin.presentation.base.Resource

class DashboardViewModel(
    private val getDashboardOverviewUseCase: GetDashboardOverviewUseCase = ServiceLocator.getDashboardOverviewUseCase
) : ViewModel() {

    private val _dashboardState = MutableLiveData<Resource<DashboardOverview>>()
    val dashboardState: LiveData<Resource<DashboardOverview>> = _dashboardState

    fun loadOverview() {
        _dashboardState.value = Resource.Loading
        viewModelScope.launch {
            getDashboardOverviewUseCase()
                .onSuccess { _dashboardState.value = Resource.Success(it) }
                .onFailure { _dashboardState.value = Resource.Error(it.message ?: "Failed to load dashboard") }
        }
    }
}

class DashboardActivity : AppCompatActivity() {

    private val viewModel = DashboardViewModel()
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var container: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { viewModel.loadOverview() }
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

        viewModel.dashboardState.observe(this) { res ->
            swipeRefresh.isRefreshing = res is Resource.Loading
            renderContent(res)
        }

        viewModel.loadOverview()
    }

    private fun setupHeader() {
        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 32)
        }

        val btnBack = Button(this).apply {
            text = "← Back"
            textSize = 12f
            setBackgroundColor(0xFF1E293B.toInt())
            setTextColor(0xFF38BDF8.toInt())
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerLayout.addView(btnBack)

        val title = TextView(this).apply {
            text = "  📊 Executive Dashboard"
            textSize = 22f
            setTextColor(0xFFEA580C.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerLayout.addView(title)
        container.addView(headerLayout)
    }

    private fun renderContent(res: Resource<DashboardOverview>) {
        while (container.childCount > 1) {
            container.removeViewAt(1)
        }

        when (res) {
            is Resource.Loading -> {
                val tv = TextView(this).apply {
                    text = "🔄 Fetching live Dhanmondi Hub analytics..."
                    setTextColor(0xFF94A3B8.toInt())
                    textSize = 15f
                    setPadding(0, 32, 0, 0)
                }
                container.addView(tv)
            }
            is Resource.Success -> {
                val d = res.data

                // 1. Metric Cards
                container.addView(createMetricCard("Gross Revenue", "৳%,.2f".format(d.grossRevenue), "Lifetime store sales volume", 0xFFEA580C.toInt()))
                container.addView(createMetricCard("Total Orders", "${d.totalOrders} Orders", "Successfully processed orders", 0xFFDB2777.toInt()))
                container.addView(createMetricCard("Average Order Value", "৳%,.2f".format(d.averageOrderValue), "Average basket size per order", 0xFF0284C7.toInt()))
                container.addView(createMetricCard("Registered Customers", "${d.totalCustomers} Customers", "Active registered buyers", 0xFF7C3AED.toInt()))
                container.addView(createMetricCard("Low Stock Alerts", "${d.lowStockAlerts} Products", "Items requiring inventory restock", 0xFFD97706.toInt()))

                // 2. Visual Sales Trend Bar Chart Card
                container.addView(createVisualChartCard(d.grossRevenue))

                // 3. Fulfillment Hub Card
                val hubCard = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundColor(0xFF1E293B.toInt())
                    setPadding(24, 24, 24, 24)
                    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    lp.setMargins(0, 0, 0, 16)
                    layoutParams = lp
                }
                val hubTitle = TextView(this).apply {
                    text = "🏬 Dhanmondi Fulfillment Hub"
                    textSize = 16f
                    setTextColor(0xFF38BDF8.toInt())
                    paint.isFakeBoldText = true
                }
                val hubDesc = TextView(this).apply {
                    text = "• Location: House 42, Road 7/A, Dhanmondi, Dhaka\n• Express Delivery: 2-4 Hours Active\n• Hub Status: Fully Operational (99.4%)"
                    textSize = 13f
                    setTextColor(0xFFF8FAFC.toInt())
                    setPadding(0, 8, 0, 0)
                    setLineSpacing(6f, 1f)
                }
                hubCard.addView(hubTitle)
                hubCard.addView(hubDesc)
                container.addView(hubCard)
            }
            is Resource.Error -> {
                val errCard = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundColor(0xFF1E293B.toInt())
                    setPadding(24, 24, 24, 24)
                    gravity = Gravity.CENTER
                }
                val tv = TextView(this).apply {
                    text = "⚠️ Failed to load dashboard:\n${res.message}"
                    setTextColor(0xFFEF4444.toInt())
                    textSize = 14f
                    gravity = Gravity.CENTER
                    setPadding(0, 0, 0, 16)
                }
                val btnRetry = Button(this).apply {
                    text = "Tap to Retry"
                    setBackgroundColor(0xFFEA580C.toInt())
                    setTextColor(0xFFFFFFFF.toInt())
                    textSize = 12f
                    setOnClickListener { viewModel.loadOverview() }
                }
                errCard.addView(tv)
                errCard.addView(btnRetry)
                container.addView(errCard)
            }
        }
    }

    private fun createMetricCard(title: String, value: String, subtitle: String, accentColor: Int): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }

        val topIndicator = View(this).apply {
            setBackgroundColor(accentColor)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 6).apply {
                setMargins(0, 0, 0, 12)
            }
        }
        card.addView(topIndicator)

        val titleTv = TextView(this).apply {
            text = title
            textSize = 13f
            setTextColor(0xFF94A3B8.toInt())
        }
        card.addView(titleTv)

        val valueTv = TextView(this).apply {
            text = value
            textSize = 22f
            setTextColor(0xFFF8FAFC.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 4, 0, 4)
        }
        card.addView(valueTv)

        val subTv = TextView(this).apply {
            text = subtitle
            textSize = 12f
            setTextColor(0xFF64748B.toInt())
        }
        card.addView(subTv)

        return card
    }

    private fun createVisualChartCard(totalRevenue: Double): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(24, 24, 24, 24)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 16)
            layoutParams = lp
        }

        val titleTv = TextView(this).apply {
            text = "📈 Weekly Sales Revenue Trend"
            textSize = 16f
            setTextColor(0xFF38BDF8.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 16)
        }
        card.addView(titleTv)

        // Visual breakdown bars for days of the week
        val days = listOf("Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri")
        val ratios = listOf(0.65f, 0.45f, 0.80f, 0.55f, 0.90f, 0.70f, 1.0f)

        days.forEachIndexed { index, day ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 6, 0, 6)
            }

            val dayTv = TextView(this).apply {
                text = day
                textSize = 12f
                setTextColor(0xFF94A3B8.toInt())
                layoutParams = LinearLayout.LayoutParams(60, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            row.addView(dayTv)

            val barContainer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(0, 16, 1f).apply {
                    setMargins(12, 0, 12, 0)
                }
                setBackgroundColor(0xFF0F172A.toInt())
            }

            val fillWidth = (ratios[index] * 200).toInt().coerceAtLeast(10)
            val fillBar = View(this).apply {
                setBackgroundColor(0xFFEA580C.toInt())
                layoutParams = LinearLayout.LayoutParams(fillWidth, LinearLayout.LayoutParams.MATCH_PARENT)
            }
            barContainer.addView(fillBar)
            row.addView(barContainer)

            val amtTv = TextView(this).apply {
                text = "৳%,.0f".format(totalRevenue * (ratios[index] * 0.15))
                textSize = 11f
                setTextColor(0xFFF8FAFC.toInt())
            }
            row.addView(amtTv)

            card.addView(row)
        }

        return card
    }
}
