package store.wonderfulcollection.admin.presentation.orders

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Order
import store.wonderfulcollection.admin.domain.usecase.GetOrdersUseCase
import store.wonderfulcollection.admin.domain.usecase.UpdateOrderStatusUseCase
import store.wonderfulcollection.admin.presentation.base.Resource

class OrdersViewModel(
    private val getOrdersUseCase: GetOrdersUseCase = ServiceLocator.getOrdersUseCase,
    private val updateOrderStatusUseCase: UpdateOrderStatusUseCase = ServiceLocator.updateOrderStatusUseCase
) : ViewModel() {

    private val _ordersState = MutableLiveData<Resource<List<Order>>>()
    val ordersState: LiveData<Resource<List<Order>>> = _ordersState

    fun loadOrders() {
        _ordersState.value = Resource.Loading
        viewModelScope.launch {
            getOrdersUseCase()
                .onSuccess { _ordersState.value = Resource.Success(it) }
                .onFailure { _ordersState.value = Resource.Error(it.message ?: "Failed to load orders") }
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

    private val viewModel = OrdersViewModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "📑 Orders Management"
            textSize = 24f
            setTextColor(0xFFDB2777.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        setContentView(scroll)

        viewModel.ordersState.observe(this) { res ->
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading orders..."; setTextColor(0xFF94A3B8.toInt()) }
                    listContainer.addView(tv)
                }
                is Resource.Success -> {
                    res.data.forEach { o ->
                        val card = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            setBackgroundColor(0xFF1E293B.toInt())
                            setPadding(24, 24, 24, 24)
                            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                            lp.setMargins(0, 0, 0, 20)
                            layoutParams = lp
                        }

                        val header = TextView(this).apply {
                            text = "${o.orderNumber} - ৳%,.0f".format(o.total)
                            textSize = 16f
                            paint.isFakeBoldText = true
                            setTextColor(0xFF38BDF8.toInt())
                        }
                        card.addView(header)

                        val details = TextView(this).apply {
                            text = "Customer: ${o.customerName} (${o.customerPhone})\nArea: ${o.deliveryArea}\nPayment: ${o.paymentMethod} (${o.paymentStatus})\nStatus: ● ${o.orderStatus}"
                            textSize = 13f
                            setTextColor(0xFFF8FAFC.toInt())
                            setLineSpacing(6f, 1f)
                            setPadding(0, 8, 0, 12)
                        }
                        card.addView(details)

                        // Action buttons row to advance status
                        val actionsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

                        val nextStatus = when (o.orderStatus) {
                            "Pending" -> "Processing"
                            "Processing" -> "Shipped"
                            "Shipped" -> "Delivered"
                            else -> null
                        }

                        if (nextStatus != null) {
                            val btnAdv = Button(this).apply {
                                text = "Mark as $nextStatus"
                                setBackgroundColor(0xFF10B981.toInt())
                                setTextColor(0xFFFFFFFF.toInt())
                                textSize = 11f
                                setOnClickListener { viewModel.updateStatus(o.id, nextStatus) }
                            }
                            actionsRow.addView(btnAdv)
                        }

                        card.addView(actionsRow)
                        listContainer.addView(card)
                    }
                }
                is Resource.Error -> {
                    val tv = TextView(this).apply { text = "Error: ${res.message}"; setTextColor(0xFFEF4444.toInt()) }
                    listContainer.addView(tv)
                }
            }
        }

        viewModel.loadOrders()
    }
}

