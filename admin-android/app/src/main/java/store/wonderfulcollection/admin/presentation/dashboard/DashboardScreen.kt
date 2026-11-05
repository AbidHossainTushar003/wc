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
                    text = "Loading store metrics..."
                    setTextColor(0xFF94A3B8.toInt())
                    textSize = 15f
                    setPadding(0, 32, 0, 0)
                }
                container.addView(tv)
            }
            is Resource.Success -> {
                val d = res.data

                // 1. Metric Cards
                container.addView(createMetricCard("Order Value Recorded", "৳%,.2f".format(d.grossRevenue), "Sum of order totals across all statuses", 0xFFEA580C.toInt()))
                container.addView(createMetricCard("Total Orders", "${d.totalOrders} Orders", "Orders recorded in the store", 0xFFDB2777.toInt()))
                container.addView(createMetricCard("Average Order Total", "৳%,.2f".format(d.averageOrderValue), "Average total across recorded orders", 0xFF0284C7.toInt()))
                container.addView(createMetricCard("Registered Customers", "${d.totalCustomers} Customers", "Customer accounts recorded", 0xFF7C3AED.toInt()))
                container.addView(createMetricCard("Low Stock Alerts", "${d.lowStockAlerts} Products", "Items requiring inventory restock", 0xFFD97706.toInt()))
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

}
