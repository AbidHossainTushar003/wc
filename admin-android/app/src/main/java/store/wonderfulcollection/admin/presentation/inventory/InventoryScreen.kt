package store.wonderfulcollection.admin.presentation.inventory

import android.os.Bundle
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
import store.wonderfulcollection.admin.domain.model.InventoryItem
import store.wonderfulcollection.admin.domain.usecase.AdjustStockUseCase
import store.wonderfulcollection.admin.domain.usecase.GetInventoryUseCase
import store.wonderfulcollection.admin.presentation.base.Resource

class InventoryViewModel(
    private val getInventoryUseCase: GetInventoryUseCase = ServiceLocator.getInventoryUseCase,
    private val adjustStockUseCase: AdjustStockUseCase = ServiceLocator.adjustStockUseCase
) : ViewModel() {

    private val _inventoryState = MutableLiveData<Resource<List<InventoryItem>>>()
    val inventoryState: LiveData<Resource<List<InventoryItem>>> = _inventoryState

    fun loadInventory() {
        _inventoryState.value = Resource.Loading
        viewModelScope.launch {
            getInventoryUseCase()
                .onSuccess { _inventoryState.value = Resource.Success(it) }
                .onFailure { _inventoryState.value = Resource.Error(it.message ?: "Failed to load inventory") }
        }
    }

    fun adjust(productId: Long, delta: Int, onComplete: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = adjustStockUseCase(productId, delta)
            result.onSuccess { loadInventory() }
            onComplete(result)
        }
    }
}

class InventoryActivity : AppCompatActivity() {

    private val viewModel = InventoryViewModel()
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout

    private fun adjustStock(productId: Long, delta: Int, buttons: List<Button>) {
        buttons.forEach { it.isEnabled = false }
        viewModel.adjust(productId, delta) { result ->
            buttons.forEach { it.isEnabled = true }
            result.onSuccess {
                val message = if (delta < 0) {
                    "Stock decreased by ${-delta}."
                } else {
                    "Stock increased by $delta."
                }
                Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
            }.onFailure { error ->
                Toast.makeText(
                    this,
                    error.message ?: "Could not update stock. Please try again.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { viewModel.loadInventory() }
        }

        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(24), dp(16), dp(24))
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        // Header Row
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, dp(12))
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
            text = "  🗄️ Stock & Inventory"
            textSize = 22f
            setTextColor(0xFFD97706.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)
        container.addView(headerRow)

        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        viewModel.inventoryState.observe(this) { res ->
            swipeRefresh.isRefreshing = res is Resource.Loading
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading stock levels..."; setTextColor(0xFF94A3B8.toInt()); textSize = 15f }
                    listContainer.addView(tv)
                }
                is Resource.Success -> {
                    if (res.data.isEmpty()) {
                        val tv = TextView(this).apply { text = "No inventory items found."; setTextColor(0xFF94A3B8.toInt()); textSize = 15f }
                        listContainer.addView(tv)
                    } else {
                        res.data.forEach { item ->
                            val card = LinearLayout(this).apply {
                                orientation = LinearLayout.VERTICAL
                                setBackgroundColor(0xFF1E293B.toInt())
                                setPadding(dp(16), dp(16), dp(16), dp(16))
                                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                                lp.setMargins(0, 0, 0, dp(12))
                                layoutParams = lp
                            }

                            val name = TextView(this).apply {
                                text = item.name
                                textSize = 16f
                                paint.isFakeBoldText = true
                                setTextColor(0xFFF8FAFC.toInt())
                            }
                            card.addView(name)

                            val color = if (item.stockQuantity <= 5) 0xFFEF4444.toInt() else 0xFF10B981.toInt()
                            val status = TextView(this).apply {
                                text = "SKU: ${item.sku}  |  Current Stock: ${item.stockQuantity} (${item.stockStatus})"
                                textSize = 13f
                                setTextColor(color)
                                paint.isFakeBoldText = true
                                setPadding(0, dp(4), 0, dp(8))
                            }
                            card.addView(status)

                            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

                            val btnMinus = Button(this).apply {
                                text = "−1"
                                textSize = 14f
                                isEnabled = item.stockQuantity > 0
                                contentDescription = "Decrease ${item.name} stock by one"
                                minHeight = dp(48)
                                minWidth = dp(48)
                                val lpBtn = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                                lpBtn.setMargins(0, 0, dp(8), 0)
                                layoutParams = lpBtn
                            }
                            actions.addView(btnMinus)

                            val btnPlus = Button(this).apply {
                                text = "+1"
                                textSize = 14f
                                contentDescription = "Increase ${item.name} stock by one"
                                minHeight = dp(48)
                                minWidth = dp(48)
                                val lpBtn = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                                lpBtn.setMargins(0, 0, dp(8), 0)
                                layoutParams = lpBtn
                            }
                            actions.addView(btnPlus)

                            val btnPlus5 = Button(this).apply {
                                text = "+5"
                                textSize = 14f
                                contentDescription = "Increase ${item.name} stock by five"
                                minHeight = dp(48)
                                minWidth = dp(48)
                                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                            }
                            actions.addView(btnPlus5)

                            btnMinus.setOnClickListener {
                                if (item.stockQuantity > 0) adjustStock(item.id, -1, listOf(btnMinus, btnPlus, btnPlus5))
                            }
                            btnPlus.setOnClickListener {
                                adjustStock(item.id, 1, listOf(btnMinus, btnPlus, btnPlus5))
                            }
                            btnPlus5.setOnClickListener {
                                adjustStock(item.id, 5, listOf(btnMinus, btnPlus, btnPlus5))
                            }

                            card.addView(actions)
                            listContainer.addView(card)
                        }
                    }
                }
                is Resource.Error -> {
                    val tv = TextView(this).apply { text = "Error: ${res.message}"; setTextColor(0xFFEF4444.toInt()); textSize = 14f }
                    listContainer.addView(tv)
                }
            }
        }

        viewModel.loadInventory()
    }
}
