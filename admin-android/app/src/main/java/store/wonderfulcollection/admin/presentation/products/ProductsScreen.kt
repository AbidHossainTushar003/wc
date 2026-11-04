package store.wonderfulcollection.admin.presentation.products

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
import store.wonderfulcollection.admin.domain.model.Product
import store.wonderfulcollection.admin.domain.usecase.CreateProductUseCase
import store.wonderfulcollection.admin.domain.usecase.GetProductsUseCase
import store.wonderfulcollection.admin.presentation.base.Resource

class ProductsViewModel(
    private val getProductsUseCase: GetProductsUseCase = ServiceLocator.getProductsUseCase,
    private val createProductUseCase: CreateProductUseCase = ServiceLocator.createProductUseCase
) : ViewModel() {

    private val _productsState = MutableLiveData<Resource<List<Product>>>()
    val productsState: LiveData<Resource<List<Product>>> = _productsState

    fun loadProducts() {
        _productsState.value = Resource.Loading
        viewModelScope.launch {
            getProductsUseCase()
                .onSuccess { _productsState.value = Resource.Success(it) }
                .onFailure { _productsState.value = Resource.Error(it.message ?: "Failed to load products") }
        }
    }

    fun addProduct(name: String, price: Double, categoryId: Long, stock: Int) {
        viewModelScope.launch {
            createProductUseCase(name, price, categoryId, stock)
                .onSuccess { loadProducts() }
        }
    }
}

class ProductsActivity : AppCompatActivity() {

    private val viewModel = ProductsViewModel()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 24)
        }

        val title = TextView(this).apply {
            text = "📦 Products"
            textSize = 24f
            setTextColor(0xFF0284C7.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)

        val addBtn = Button(this).apply {
            text = "+ Add"
            setBackgroundColor(0xFF0284C7.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                viewModel.addProduct("Dhanmondi Signature Collection #${(10..99).random()}", 2800.0, 1, 20)
            }
        }
        headerRow.addView(addBtn)
        container.addView(headerRow)

        val listContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        container.addView(listContainer)

        setContentView(scroll)

        viewModel.productsState.observe(this) { res ->
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading products..."; setTextColor(0xFF94A3B8.toInt()) }
                    listContainer.addView(tv)
                }
                is Resource.Success -> {
                    res.data.forEach { p ->
                        val itemCard = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            setBackgroundColor(0xFF1E293B.toInt())
                            setPadding(24, 24, 24, 24)
                            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                            lp.setMargins(0, 0, 0, 20)
                            layoutParams = lp
                        }

                        val nameTv = TextView(this).apply {
                            text = p.name
                            textSize = 16f
                            setTextColor(0xFFF8FAFC.toInt())
                            paint.isFakeBoldText = true
                        }
                        itemCard.addView(nameTv)

                        val priceTv = TextView(this).apply {
                            val priceStr = if (p.salePrice != null) "৳%,.0f (Was ৳%,.0f)".format(p.salePrice, p.regularPrice) else "৳%,.0f".format(p.regularPrice)
                            text = "Price: $priceStr  |  Stock: ${p.stockQuantity}  |  Category: ${p.categoryName}"
                            textSize = 13f
                            setTextColor(0xFF94A3B8.toInt())
                            setPadding(0, 8, 0, 0)
                        }
                        itemCard.addView(priceTv)

                        listContainer.addView(itemCard)
                    }
                }
                is Resource.Error -> {
                    val tv = TextView(this).apply { text = "Error: ${res.message}"; setTextColor(0xFFEF4444.toInt()) }
                    listContainer.addView(tv)
                }
            }
        }

        viewModel.loadProducts()
    }
}

