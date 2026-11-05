package store.wonderfulcollection.admin.presentation.products

import android.R
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Category
import store.wonderfulcollection.admin.domain.model.Product
import store.wonderfulcollection.admin.domain.model.ProductImageFile
import store.wonderfulcollection.admin.domain.usecase.CreateProductUseCase
import store.wonderfulcollection.admin.domain.usecase.GetProductsUseCase
import store.wonderfulcollection.admin.presentation.base.Resource
import java.io.ByteArrayOutputStream
import java.io.File

class ProductsViewModel(
    private val getProductsUseCase: GetProductsUseCase = ServiceLocator.getProductsUseCase,
    private val createProductUseCase: CreateProductUseCase = ServiceLocator.createProductUseCase
) : ViewModel() {

    private val _productsState = MutableLiveData<Resource<List<Product>>>()
    val productsState: LiveData<Resource<List<Product>>> = _productsState

    private var allProducts = listOf<Product>()

    fun loadProducts() {
        _productsState.value = Resource.Loading
        viewModelScope.launch {
            getProductsUseCase()
                .onSuccess { products ->
                    allProducts = products
                    _productsState.value = Resource.Success(products)
                }
                .onFailure { _productsState.value = Resource.Error(it.message ?: "Failed to load products") }
        }
    }

    fun filterProducts(query: String) {
        val filtered = if (query.isBlank()) {
            allProducts
        } else {
            allProducts.filter {
                it.name.contains(query, ignoreCase = true) ||
                it.sku.contains(query, ignoreCase = true) ||
                it.categoryName.contains(query, ignoreCase = true)
            }
        }
        _productsState.value = Resource.Success(filtered)
    }

    fun updateProduct(
        id: Long,
        name: String,
        shortDescription: String,
        regularPrice: Double,
        salePrice: Double?,
        stock: Int,
        onComplete: (Result<Unit>) -> Unit
    ) {
        viewModelScope.launch {
            val result = ServiceLocator.productRepository.updateProduct(id, name, shortDescription, regularPrice, salePrice, stock)
            result.onSuccess { loadProducts() }
            onComplete(result)
        }
    }

    fun addProduct(
        name: String,
        shortDescription: String,
        description: String,
        regularPrice: Double,
        salePrice: Double?,
        categoryId: Long,
        stock: Int,
        sku: String?,
        isFeatured: Boolean,
        isTrending: Boolean,
        imageFiles: List<ProductImageFile>,
        onComplete: (Result<Long>) -> Unit
    ) {
        viewModelScope.launch {
            val result = createProductUseCase(
                name, shortDescription, description, regularPrice, salePrice, categoryId, stock,
                sku, isFeatured, isTrending, imageFiles
            )
            result.onSuccess { loadProducts() }
            onComplete(result)
        }
    }
}

class ProductsActivity : AppCompatActivity() {

    private val viewModel = ProductsViewModel()
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout
    private val selectedImageUris = mutableListOf<Uri>()
    private var imageSelectionSummary: TextView? = null

    private val imagePickerLauncher = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        selectedImageUris.clear()
        selectedImageUris.addAll(uris.take(MAX_PRODUCT_IMAGES))
        imageSelectionSummary?.text = if (selectedImageUris.isEmpty()) {
            "No photos selected. Choose 1-$MAX_PRODUCT_IMAGES product photos."
        } else {
            "${selectedImageUris.size} photo(s) selected"
        }
        if (uris.size > MAX_PRODUCT_IMAGES) {
            Toast.makeText(this, "You can add up to $MAX_PRODUCT_IMAGES photos per product.", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { viewModel.loadProducts() }
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
            text = "  📦 Products Inventory"
            textSize = 22f
            setTextColor(0xFF0284C7.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)

        val addBtn = Button(this).apply {
            text = "+ Add"
            textSize = 12f
            setBackgroundColor(0xFF0284C7.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener { showAddProductDialog() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(addBtn)
        container.addView(headerRow)

        // Enterprise Search Bar
        val searchInput = EditText(this).apply {
            hint = "🔍 Search products by name, SKU, category..."
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
                    viewModel.filterProducts(s?.toString() ?: "")
                }
                override fun afterTextChanged(s: Editable?) {}
            })
        }
        container.addView(searchInput)

        listContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        container.addView(listContainer)

        viewModel.productsState.observe(this) { res ->
            swipeRefresh.isRefreshing = res is Resource.Loading
            listContainer.removeAllViews()
            when (res) {
                is Resource.Loading -> {
                    val tv = TextView(this).apply { text = "Loading products..."; setTextColor(0xFF94A3B8.toInt()); textSize = 15f }
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
                            text = "📦 No products found.\nTap '+ Add' above to create your first product."
                            setTextColor(0xFF94A3B8.toInt())
                            textSize = 14f
                            gravity = Gravity.CENTER
                            setLineSpacing(6f, 1f)
                        }
                        emptyCard.addView(tv)
                        listContainer.addView(emptyCard)
                    } else {
                        res.data.forEach { p ->
                            val itemCard = LinearLayout(this).apply {
                                orientation = LinearLayout.VERTICAL
                                setBackgroundColor(0xFF1E293B.toInt())
                                setPadding(24, 24, 24, 24)
                                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                                lp.setMargins(0, 0, 0, 16)
                                layoutParams = lp
                                setOnClickListener { showEditProductDialog(p) }
                            }

                            val nameTv = TextView(this).apply {
                                text = p.name
                                textSize = 16f
                                setTextColor(0xFFF8FAFC.toInt())
                                paint.isFakeBoldText = true
                            }
                            itemCard.addView(nameTv)

                            val priceStr = if (p.salePrice != null) "৳%,.0f (Was ৳%,.0f)".format(p.salePrice, p.regularPrice) else "৳%,.0f".format(p.regularPrice)
                            val priceTv = TextView(this).apply {
                                text = "Price: $priceStr  |  Stock: ${p.stockQuantity}  |  Category: ${p.categoryName}"
                                textSize = 13f
                                setTextColor(0xFF94A3B8.toInt())
                                setPadding(0, 8, 0, 0)
                            }
                            itemCard.addView(priceTv)

                            if (p.shortDesc.isNotBlank()) {
                                val descTv = TextView(this).apply {
                                    text = "Desc: ${p.shortDesc}"
                                    textSize = 12f
                                    setTextColor(0xFF64748B.toInt())
                                    setPadding(0, 4, 0, 0)
                                }
                                itemCard.addView(descTv)
                            }

                            listContainer.addView(itemCard)
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
                        text = "⚠️ Failed to load products:\n${res.message}"
                        setTextColor(0xFFEF4444.toInt())
                        textSize = 14f
                        gravity = Gravity.CENTER
                        setPadding(0, 0, 0, 16)
                    }
                    val btnRetry = Button(this).apply {
                        text = "Tap to Retry"
                        setBackgroundColor(0xFF0284C7.toInt())
                        setTextColor(0xFFFFFFFF.toInt())
                        textSize = 12f
                        setOnClickListener { viewModel.loadProducts() }
                    }
                    errCard.addView(tv)
                    errCard.addView(btnRetry)
                    listContainer.addView(errCard)
                }
            }
        }

        viewModel.loadProducts()
        if (savedInstanceState == null && intent.getBooleanExtra(EXTRA_OPEN_ADD_PRODUCT, false)) {
            showAddProductDialog()
        }
    }

    private fun showAddProductDialog() {
        lifecycleScope.launch {
            val categories = ServiceLocator.getCategoriesUseCase().getOrElse {
                Toast.makeText(this@ProductsActivity, it.message ?: "Could not load product categories.", Toast.LENGTH_LONG).show()
                return@launch
            }
            if (categories.isEmpty()) {
                Toast.makeText(this@ProductsActivity, "Create a category before adding products.", Toast.LENGTH_LONG).show()
                return@launch
            }
            showProductForm(categories)
        }
    }

    private fun showEditProductDialog(product: Product) {
        val formLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 24, 32, 24)
        }

        val etName = EditText(this).apply {
            hint = "Product Name"
            setText(product.name)
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val etShortDesc = EditText(this).apply {
            hint = "Short description"
            setText(product.shortDesc)
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val etRegularPrice = EditText(this).apply {
            hint = "Regular Price"
            setText(product.regularPrice.toString())
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val etSalePrice = EditText(this).apply {
            hint = "Sale Price (Optional)"
            setText(product.salePrice?.toString() ?: "")
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val etStock = EditText(this).apply {
            hint = "Stock Quantity"
            setText(product.stockQuantity.toString())
            inputType = InputType.TYPE_CLASS_NUMBER
        }

        formLayout.addView(etName)
        formLayout.addView(etShortDesc)
        formLayout.addView(etRegularPrice)
        formLayout.addView(etSalePrice)
        formLayout.addView(etStock)

        val scrollForm = ScrollView(this).apply { addView(formLayout) }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Edit Product #${product.id}")
            .setView(scrollForm)
            .setPositiveButton("Update", null)
            .setNegativeButton("Cancel", null)
            .show()

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val name = etName.text.toString().trim()
            val shortDesc = etShortDesc.text.toString().trim()
            val regPrice = etRegularPrice.text.toString().toDoubleOrNull()
            val salePriceText = etSalePrice.text.toString().trim()
            val salePrice = if (salePriceText.isEmpty()) null else salePriceText.toDoubleOrNull()
            val stock = etStock.text.toString().toIntOrNull()

            if (name.isEmpty() || regPrice == null || regPrice <= 0 || stock == null || stock < 0) {
                Toast.makeText(this, "Please enter valid product details.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val btn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            btn.isEnabled = false
            btn.text = "Updating..."

            viewModel.updateProduct(product.id, name, shortDesc, regPrice, salePrice, stock) { result ->
                if (result.isSuccess) {
                    dialog.dismiss()
                    Toast.makeText(this, "Product updated successfully.", Toast.LENGTH_SHORT).show()
                } else {
                    btn.isEnabled = true
                    btn.text = "Update"
                    Toast.makeText(this, result.exceptionOrNull()?.message ?: "Update failed.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showProductForm(categories: List<Category>) {
        selectedImageUris.clear()
        val formLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 24, 32, 24)
        }

        val etName = EditText(this).apply {
            hint = "Product Title / Name (e.g. Premium Punjabi)"
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val etSku = EditText(this).apply {
            hint = "SKU (optional; generated if blank)"
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val etShortDesc = EditText(this).apply {
            hint = "Short description"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        val etDesc = EditText(this).apply {
            hint = "Full product description"
            minLines = 3
            gravity = Gravity.TOP
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        val categorySpinner = Spinner(this).apply {
            adapter = ArrayAdapter(
                this@ProductsActivity,
                R.layout.simple_spinner_dropdown_item,
                categories.map { it.name }
            )
        }
        val etRegularPrice = EditText(this).apply {
            hint = "Regular Price in ৳ (e.g. 2800)"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val etSalePrice = EditText(this).apply {
            hint = "Sale Price in ৳ (Optional)"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val etStock = EditText(this).apply {
            hint = "Stock Inventory Quantity (e.g. 25)"
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        val featuredCheck = CheckBox(this).apply {
            text = "Feature this product"
            setTextColor(0xFFF8FAFC.toInt())
        }
        val trendingCheck = CheckBox(this).apply {
            text = "Mark as trending"
            setTextColor(0xFFF8FAFC.toInt())
        }
        val selectedImagesLabel = TextView(this).apply {
            text = "No photos selected. Choose 1-$MAX_PRODUCT_IMAGES product photos."
            textSize = 13f
            setTextColor(0xFF94A3B8.toInt())
        }
        imageSelectionSummary = selectedImagesLabel
        val btnPickImages = Button(this).apply {
            text = "Choose product photos"
            setBackgroundColor(0xFF0284C7.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 12f
            setOnClickListener {
                imagePickerLauncher.launch(arrayOf("image/jpeg", "image/png", "image/webp"))
            }
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.setMargins(0, 8, 0, 12)
            layoutParams = lp
        }

        formLayout.addView(etName)
        formLayout.addView(etSku)
        formLayout.addView(etShortDesc)
        formLayout.addView(etDesc)
        formLayout.addView(categorySpinner)
        formLayout.addView(etRegularPrice)
        formLayout.addView(etSalePrice)
        formLayout.addView(etStock)
        formLayout.addView(featuredCheck)
        formLayout.addView(trendingCheck)
        formLayout.addView(btnPickImages)
        formLayout.addView(selectedImagesLabel)

        val scrollForm = ScrollView(this).apply {
            addView(formLayout)
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Add New Product (Full Details)")
            .setView(scrollForm)
            .setPositiveButton("Save Product", null)
            .setNegativeButton("Cancel", null)
            .show()

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val name = etName.text.toString().trim()
            val shortDescription = etShortDesc.text.toString().trim()
            val description = etDesc.text.toString().trim()
            val regularPrice = etRegularPrice.text.toString().toDoubleOrNull()
            val salePriceText = etSalePrice.text.toString().trim()
            val salePrice = if (salePriceText.isEmpty()) null else salePriceText.toDoubleOrNull()
            val stock = etStock.text.toString().toIntOrNull()
            val category = categories.getOrNull(categorySpinner.selectedItemPosition)

            val validationError = when {
                name.isEmpty() -> "Enter a product name."
                regularPrice == null || regularPrice <= 0.0 -> "Enter a valid regular price."
                salePriceText.isNotEmpty() && salePrice == null -> "Enter a valid sale price."
                salePrice != null && (salePrice <= 0.0 || salePrice >= regularPrice) -> "Sale price must be less than regular price."
                stock == null || stock < 0 -> "Enter a stock quantity of zero or more."
                category == null -> "Choose a product category."
                selectedImageUris.isEmpty() -> "Choose at least one product photo."
                else -> null
            }
            if (validationError != null) {
                Toast.makeText(this, validationError, Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val saveButton = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            saveButton.isEnabled = false
            saveButton.text = "Preparing photos..."
            lifecycleScope.launch {
                val imageFiles = try {
                    selectedImageUris.map { uri -> compressProductImage(uri) }
                } catch (error: Exception) {
                    saveButton.isEnabled = true
                    saveButton.text = "Save Product"
                    Toast.makeText(this@ProductsActivity, error.message ?: "Could not prepare the selected photos.", Toast.LENGTH_LONG).show()
                    return@launch
                }

                saveButton.text = "Uploading & saving..."
                viewModel.addProduct(
                    name = name,
                    shortDescription = shortDescription,
                    description = description,
                    regularPrice = regularPrice!!,
                    salePrice = salePrice,
                    categoryId = category!!.id,
                    stock = stock!!,
                    sku = etSku.text.toString().trim().ifEmpty { null },
                    isFeatured = featuredCheck.isChecked,
                    isTrending = trendingCheck.isChecked,
                    imageFiles = imageFiles
                ) { result ->
                    if (result.isSuccess) {
                        dialog.dismiss()
                        Toast.makeText(this@ProductsActivity, "Product '$name' added successfully.", Toast.LENGTH_LONG).show()
                    } else {
                        saveButton.isEnabled = true
                        saveButton.text = "Save Product"
                        Toast.makeText(
                            this@ProductsActivity,
                            result.exceptionOrNull()?.message ?: "Could not save product.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
        }
    }

    private suspend fun compressProductImage(uri: Uri): ProductImageFile = withContext(Dispatchers.IO) {
        val tempFile = File(cacheDir, "upload_${System.currentTimeMillis()}_${(0..999).random()}.jpg")
        try {
            contentResolver.openInputStream(uri)?.use { input ->
                tempFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            } ?: throw IllegalArgumentException("Could not access photo stream.")
        } catch (e: Exception) {
            throw IllegalArgumentException("Could not read one of the selected photos: ${e.localizedMessage}")
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(tempFile.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            tempFile.delete()
            throw IllegalArgumentException("One of the selected files is not a valid image.")
        }

        var sampleSize = 1
        while (maxOf(bounds.outWidth / sampleSize, bounds.outHeight / sampleSize) > 1600) {
            sampleSize *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        var bitmap = BitmapFactory.decodeFile(tempFile.absolutePath, options)
            ?: run {
                tempFile.delete()
                throw IllegalArgumentException("Could not decode one of the selected photos.")
            }

        try {
            var quality = 82
            var compressed: ByteArray? = null
            while (compressed == null) {
                val output = ByteArrayOutputStream()
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) {
                    tempFile.delete()
                    throw IllegalArgumentException("Could not compress one of the selected photos.")
                }
                val bytes = output.toByteArray()
                if (bytes.size <= MAX_IMAGE_BYTES) {
                    compressed = bytes
                } else if (quality > 55) {
                    quality -= 9
                } else if (maxOf(bitmap.width, bitmap.height) > 800) {
                    val resized = Bitmap.createScaledBitmap(
                        bitmap,
                        (bitmap.width * 0.7f).toInt().coerceAtLeast(1),
                        (bitmap.height * 0.7f).toInt().coerceAtLeast(1),
                        true
                    )
                    bitmap.recycle()
                    bitmap = resized
                    quality = 75
                } else {
                    tempFile.delete()
                    throw IllegalArgumentException("A selected photo could not be reduced below 1.5 MB.")
                }
            }
            tempFile.delete()
            ProductImageFile("image/jpeg", checkNotNull(compressed))
        } finally {
            if (!bitmap.isRecycled) bitmap.recycle()
            if (tempFile.exists()) tempFile.delete()
        }
    }

    companion object {
        const val EXTRA_OPEN_ADD_PRODUCT = "store.wonderfulcollection.admin.OPEN_ADD_PRODUCT"
        private const val MAX_PRODUCT_IMAGES = 5
        private const val MAX_IMAGE_BYTES = 1_450_000
    }
}
