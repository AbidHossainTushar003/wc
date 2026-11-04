package store.wonderfulcollection.admin.presentation.orders

import android.app.Application
import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Order
import store.wonderfulcollection.admin.domain.usecase.GetOrdersUseCase
import store.wonderfulcollection.admin.domain.usecase.UpdateOrderStatusUseCase
import store.wonderfulcollection.admin.presentation.base.Resource

class OrdersViewModel(
    application: Application,
    private val getOrdersUseCase: GetOrdersUseCase = ServiceLocator.getOrdersUseCase,
    private val updateOrderStatusUseCase: UpdateOrderStatusUseCase = ServiceLocator.updateOrderStatusUseCase
) : AndroidViewModel(application) {

    private val _ordersState = MutableLiveData<Resource<List<Order>>>()
    val ordersState: LiveData<Resource<List<Order>>> = _ordersState

    private var allOrders = listOf<Order>()
    private var currentStatusFilter: String = "All"
    private var currentSearchQuery: String = ""

    fun loadOrders() {
        _ordersState.value = Resource.Loading
        viewModelScope.launch {
            getOrdersUseCase()
                .onSuccess { orders ->
                    allOrders = orders
                    applyFilters()
                    checkNewOrder(orders)
                }
                .onFailure { _ordersState.value = Resource.Error(it.message ?: "Failed to load orders") }
        }
    }

    fun filterByStatus(status: String) {
        currentStatusFilter = status
        applyFilters()
    }

    fun filterByQuery(query: String) {
        currentSearchQuery = query
        applyFilters()
    }

    private fun applyFilters() {
        var filtered = allOrders
        if (currentStatusFilter != "All") {
            filtered = filtered.filter { it.orderStatus.equals(currentStatusFilter, true) }
        }
        if (currentSearchQuery.isNotBlank()) {
            filtered = filtered.filter {
                it.orderNumber.contains(currentSearchQuery, ignoreCase = true) ||
                it.customerName.contains(currentSearchQuery, ignoreCase = true) ||
                it.customerPhone.contains(currentSearchQuery, ignoreCase = true)
            }
        }
        _ordersState.value = Resource.Success(filtered)
    }

    private fun checkNewOrder(orders: List<Order>) {
        if (orders.isEmpty()) return
        val prefs = getApplication<Application>().getSharedPreferences("admin_prefs", Context.MODE_PRIVATE)
        val lastSeenId = prefs.getLong("last_seen_order_id", 0L)
        val latest = orders.maxByOrNull { it.id } ?: return

        if (latest.id > lastSeenId) {
            prefs.edit().putLong("last_seen_order_id", latest.id).apply()
            if (lastSeenId != 0L) {
                OrderNotificationHelper.showOrderNotification(
                    getApplication(),
                    latest.orderNumber,
                    latest.customerName,
                    latest.total,
                    latest.id
                )
            }
        }
    }

    fun updateStatus(orderId: Long, status: String) {
        viewModelScope.launch {
            updateOrderStatusUseCase(orderId, status)
                .onSuccess { loadOrders() }
        }
    }
}

class OrdersActivity : AppCompatActivity() {

    private val viewModel by lazy { OrdersViewModel(application) }
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { viewModel.loadOrders() }
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
            setPadding(0, 0, 0, 20)
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
            text = "  📑 Customer Orders"
            textSize = 22f
            setTextColor(0xFFDB2777.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)
        container.addView(headerRow)

        // Status Filter Chips Row
        val statusScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setPadding(0, 0, 0, 16)
        }
        val statusChipsLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val statuses = listOf("All", "Pending", "Processing", "Shipped", "Delivered")
        statuses.forEach { st ->
            val chip = Button(this).apply {
                text = st
                textSize = 12f
                setBackgroundColor(if (st == "All") 0xFFDB2777.toInt() else 0xFF1E293B.toInt())
                setTextColor(0xFFFFFFFF.toInt())
                setOnClickListener {
                    // Update chip styling
                    for (i in 0 until statusChipsLayout.childCount) {
                        val child = statusChipsLayout.getChildAt(i) as? Button
                        child?.setBackgroundColor(0xFF1E293B.toInt())
                    }
                    setBackgroundColor(0xFFDB2777.toInt())
                    viewModel.filterByStatus(st)
                }
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.setMargins(0, 0, 12, 0)
                layoutParams = lp
            }
            statusChipsLayout.addView(chip)
        }
        statusScroll.addView(statusChipsLayout)
        container.addView(statusScroll)

        // Search Filter Bar
        val searchInput = EditText(this).apply {
            hint = "🔍 Search orders by number, customer..."
            setTextColor(0xFFF8FAFC.toInt())
            setHintTextColor(0xFF64748B.toInt())
            setBackgroundColor(0xFF1E293B.toInt())
            setPadding(28, 24, 28, 24)
            textSize = 14f
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 0, 0, 24)
            layoutParams = lp
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    viewModel.filterByQuery(s?.toString() ?: "")
                }
                override fun afterTextChanged(s: Editable?) {}
            })
        }
        container.addView(searchInput)

        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        viewModel.ordersState.observe(this) { res ->
            swipeRefresh.isRefreshing = res is Resource.Loading
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading live orders..."; setTextColor(0xFF94A3B8.toInt()); textSize = 15f }
                    listContainer.addView(tv)
                }
                is Resource.Success -> {
                    if (res.data.isEmpty()) {
                        val emptyCard = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            setBackgroundColor(0xFF1E293B.toInt())
                            setPadding(32, 40, 32, 40)
                            gravity = Gravity.CENTER
                        }
                        val tv = TextView(this).apply {
                            text = "📑 No matching customer orders found.\nOrders placed in the store will appear here instantly."
                            setTextColor(0xFF94A3B8.toInt())
                            textSize = 14f
                            gravity = Gravity.CENTER
                            setLineSpacing(6f, 1f)
                        }
                        emptyCard.addView(tv)
                        listContainer.addView(emptyCard)
                    } else {
                        res.data.forEach { o ->
                            val card = LinearLayout(this).apply {
                                orientation = LinearLayout.VERTICAL
                                setBackgroundColor(0xFF1E293B.toInt())
                                setPadding(24, 24, 24, 24)
                                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                                lp.setMargins(0, 0, 0, 16)
                                layoutParams = lp
                            }

                            val statusColor = when (o.orderStatus) {
                                "Pending" -> 0xFFF59E0B.toInt()
                                "Processing" -> 0xFF3B82F6.toInt()
                                "Shipped" -> 0xFF8B5CF6.toInt()
                                "Delivered" -> 0xFF10B981.toInt()
                                else -> 0xFF64748B.toInt()
                            }
                            val accentLine = View(this).apply {
                                setBackgroundColor(statusColor)
                                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 6).apply {
                                    setMargins(0, 0, 0, 14)
                                }
                            }
                            card.addView(accentLine)

                            val headerLayout = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                            val orderNumTv = TextView(this).apply {
                                text = o.orderNumber
                                textSize = 16f
                                paint.isFakeBoldText = true
                                setTextColor(0xFF38BDF8.toInt())
                                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                            }
                            val priceTv = TextView(this).apply {
                                text = "৳%,.0f".format(o.total)
                                textSize = 16f
                                paint.isFakeBoldText = true
                                setTextColor(0xFF10B981.toInt())
                            }
                            headerLayout.addView(orderNumTv)
                            headerLayout.addView(priceTv)
                            card.addView(headerLayout)

                            val details = TextView(this).apply {
                                text = "👤 Customer: ${o.customerName} (${o.customerPhone})\n📍 Area: ${o.deliveryArea} — ${o.deliveryAddress}\n💳 Payment: ${o.paymentMethod} (${o.paymentStatus})\n📌 Status: ${o.orderStatus}"
                                textSize = 13f
                                setTextColor(0xFFF8FAFC.toInt())
                                setLineSpacing(6f, 1f)
                                setPadding(0, 10, 0, 14)
                            }
                            card.addView(details)

                            val nextStatus = when (o.orderStatus) {
                                "Pending" -> "Processing"
                                "Processing" -> "Shipped"
                                "Shipped" -> "Delivered"
                                else -> null
                            }

                            if (nextStatus != null) {
                                val actionsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                                val btnAdv = Button(this).apply {
                                    text = "Advance to $nextStatus →"
                                    setBackgroundColor(0xFF10B981.toInt())
                                    setTextColor(0xFFFFFFFF.toInt())
                                    textSize = 12f
                                    setOnClickListener { viewModel.updateStatus(o.id, nextStatus) }
                                }
                                actionsRow.addView(btnAdv)
                                card.addView(actionsRow)
                            }

                            listContainer.addView(card)
                        }
                    }
                }
                is Resource.Error -> {
                    val errCard = LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL
                        setBackgroundColor(0xFF1E293B.toInt())
                        setPadding(24, 24, 24, 24)
                        gravity = Gravity.CENTER
                    }
                    val tv = TextView(this).apply {
                        text = "⚠️ Failed to load orders:\n${res.message}"
                        setTextColor(0xFFEF4444.toInt())
                        textSize = 14f
                        gravity = Gravity.CENTER
                        setPadding(0, 0, 0, 16)
                    }
                    val btnRetry = Button(this).apply {
                        text = "Tap to Retry"
                        setBackgroundColor(0xFFDB2777.toInt())
                        setTextColor(0xFFFFFFFF.toInt())
                        textSize = 12f
                        setOnClickListener { viewModel.loadOrders() }
                    }
                    errCard.addView(tv)
                    errCard.addView(btnRetry)
                    listContainer.addView(errCard)
                }
            }
        }

        viewModel.loadOrders()
    }
}
