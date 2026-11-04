package store.wonderfulcollection.admin.presentation.inventory

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

    fun adjust(productId: Long, delta: Int) {
        viewModelScope.launch {
            adjustStockUseCase(productId, delta)
                .onSuccess { loadInventory() }
        }
    }
}

class InventoryActivity : AppCompatActivity() {

    private val viewModel = InventoryViewModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "🗄️ Stock & Inventory"
            textSize = 24f
            setTextColor(0xFFD97706.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        setContentView(scroll)

        viewModel.inventoryState.observe(this) { res ->
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading stock levels..."; setTextColor(0xFF94A3B8.toInt()) }
                    listContainer.addView(tv)
                }
                is Resource.Success -> {
                    res.data.forEach { item ->
                        val card = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            setBackgroundColor(0xFF1E293B.toInt())
                            setPadding(24, 24, 24, 24)
                            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                            lp.setMargins(0, 0, 0, 16)
                            layoutParams = lp
                        }

                        val name = TextView(this).apply {
                            text = item.name
                            textSize = 15f
                            paint.isFakeBoldText = true
                            setTextColor(0xFFF8FAFC.toInt())
                        }
                        card.addView(name)

                        val status = TextView(this).apply {
                            val color = if (item.stockQuantity <= 5) 0xFFEF4444.toInt() else 0xFF10B981.toInt()
                            text = "SKU: ${item.sku}  |  Current Stock: ${item.stockQuantity} (${item.stockStatus})"
                            textSize = 13f
                            setTextColor(color)
                            paint.isFakeBoldText = true
                            setPadding(0, 6, 0, 12)
                        }
                        card.addView(status)

                        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                        val btnMinus = Button(this).apply {
                            text = "-1"
                            textSize = 12f
                            setOnClickListener { viewModel.adjust(item.id, -1) }
                        }
                        actions.addView(btnMinus)

                        val btnPlus = Button(this).apply {
                            text = "+1"
                            textSize = 12f
                            setOnClickListener { viewModel.adjust(item.id, 1) }
                        }
                        actions.addView(btnPlus)

                        val btnPlus5 = Button(this).apply {
                            text = "+5"
                            textSize = 12f
                            setOnClickListener { viewModel.adjust(item.id, 5) }
                        }
                        actions.addView(btnPlus5)

                        card.addView(actions)
                        listContainer.addView(card)
                    }
                }
                is Resource.Error -> {
                    val tv = TextView(this).apply { text = "Error: ${res.message}"; setTextColor(0xFFEF4444.toInt()) }
                    listContainer.addView(tv)
                }
            }
        }

        viewModel.loadInventory()
    }
}

