package store.wonderfulcollection.admin.presentation.dashboard

import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF0F172A.toInt())
            setPadding(32, 48, 32, 32)
        }

        val title = TextView(this).apply {
            text = "📊 Store Dashboard"
            textSize = 24f
            setTextColor(0xFFEA580C.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 32)
        }
        root.addView(title)

        val contentText = TextView(this).apply {
            text = "Loading store metrics..."
            textSize = 16f
            setTextColor(0xFFF8FAFC.toInt())
            setLineSpacing(16f, 1f)
        }
        root.addView(contentText)

        setContentView(root)

        viewModel.dashboardState.observe(this) { res ->
            when (res) {
                is Resource.Loading -> contentText.text = "Fetching live Dhanmondi Hub metrics..."
                is Resource.Success -> {
                    val d = res.data
                    contentText.text = """
                        💰 Gross Revenue: ৳%,.0f
                        📦 Total Orders: %d
                        🏷️ Average Order Value (AOV): ৳%,.0f
                        👥 Registered Customers: %d
                        ⚠️ Low Stock Alerts: %d Products
                        
                        📍 Fulfillment Center: House 42, Road 7/A, Dhanmondi
                        ⚡ Express Delivery: Active in Dhanmondi, Dhaka
                    """.trimIndent().format(
                        d.grossRevenue,
                        d.totalOrders,
                        d.averageOrderValue,
                        d.totalCustomers,
                        d.lowStockAlerts
                    )
                }
                is Resource.Error -> contentText.text = "⚠️ Notice: ${res.message}\n(Backend active at wonderfulcollection.store or local server)"
            }
        }

        viewModel.loadOverview()
    }
}

