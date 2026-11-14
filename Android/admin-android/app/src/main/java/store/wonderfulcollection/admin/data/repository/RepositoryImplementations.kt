package store.wonderfulcollection.admin.data.repository

import org.json.JSONArray
import org.json.JSONObject
import store.wonderfulcollection.admin.data.api.ApiClient
import store.wonderfulcollection.admin.data.api.MAX_PRODUCT_IMAGES
import store.wonderfulcollection.admin.domain.model.*
import store.wonderfulcollection.admin.domain.repository.*
import java.net.URI
import java.util.UUID

private const val FALLBACK_PRODUCT_IMAGE = "https://shopademia.store/assets/product-placeholder.svg"

internal fun JSONObject.optStringSafe(key: String, default: String = ""): String =
    if (has(key) && !isNull(key)) optString(key) else default

private fun firstProductImage(images: JSONArray?): String =
    images?.takeIf { it.length() > 0 }?.optString(0)?.takeIf { it.isNotBlank() }
        ?: FALLBACK_PRODUCT_IMAGE

internal fun productPricingError(regularPrice: Double, salePrice: Double?): String? = when {
    (!regularPrice.isFinite()) || (regularPrice <= 0.0) -> "Regular price must be greater than zero."
    (salePrice != null) && ((!salePrice.isFinite()) || (salePrice <= 0.0) || (salePrice >= regularPrice)) ->
        "Sale price must be greater than zero and less than regular price."
    else -> null
}

internal fun productSeoValidationError(
    seoTitle: String,
    metaDescription: String,
    focusKeyword: String,
    h1: String,
    altText: String,
    canonicalUrl: String,
): String? {
    val fields = listOf(
        seoTitle to 70,
        metaDescription to 160,
        focusKeyword to 100,
        h1 to 150,
        altText to 200,
        canonicalUrl to 500,
    )
    if (fields.any {
            (value, limit) -> value.toByteArray(Charsets.UTF_8).size > limit ||
                value.any { it.code < 0x20 || it.code == 0x7f }
        }
    ) {
        return "SEO fields exceed their allowed length or contain invalid characters."
    }
    if (canonicalUrl.isNotBlank()) {
        val uri = runCatching { URI(canonicalUrl) }.getOrNull()
        if (
            uri?.scheme?.equals("https", ignoreCase = true) != true ||
            uri.host?.lowercase() !in setOf("shopademia.store", "www.shopademia.store")
        ) {
            return "Canonical URL must be a valid HTTPS URL on shopademia.store."
        }
    }
    return null
}

internal fun parseProduct(obj: JSONObject): Product {
    val id = obj.optLong("id", 0L)
    val name = obj.optString("name", obj.optString("product_name", "")).trim()
    val categoryId = obj.optLong("category_id", obj.optLong("categoryId", 0L))
    val regularPrice = obj.optDouble("regular_price", obj.optDouble("price", 0.0))
    val stockQuantity = obj.optInt("stock_quantity", obj.optInt("stock", 0))
    require(id > 0L && name.isNotBlank()) { "Product response is missing required identity fields." }
    require(regularPrice.isFinite() && regularPrice > 0.0 && stockQuantity >= 0) {
        "Product response contains invalid price or stock data."
    }

    val images = when {
        obj.has("images") && !obj.isNull("images") -> obj.optJSONArray("images")
        obj.has("image") && !obj.isNull("image") -> JSONArray().apply { put(obj.optString("image")) }
        else -> null
    }
    if (obj.has("images") && !obj.isNull("images") && images == null) {
        throw IllegalArgumentException("Product response contains invalid image data.")
    }
    val imagePaths = images?.let { array ->
        List(array.length()) { index ->
            when (val value = array.opt(index)) {
                is String -> value.takeIf(String::isNotBlank)
                    ?: throw IllegalArgumentException("Product response contains an empty image path.")
                else -> value?.toString()?.takeIf(String::isNotBlank)
                    ?: throw IllegalArgumentException("Product response contains an empty image path.")
            }
        }
    }.orEmpty()
    val salePrice = listOf("sale_price", "special_price", "discount_price")
        .firstOrNull { obj.has(it) && !obj.isNull(it) }
        ?.let { obj.optDouble(it, Double.NaN) }
        ?.takeIf { it.isFinite() && it > 0.0 }
    require(salePrice == null || (salePrice.isFinite() && salePrice > 0.0 && salePrice < regularPrice)) {
        "Product response contains an invalid sale price."
    }

    return Product(
        id = id,
        name = name,
        slug = obj.optStringSafe("slug"),
        categoryId = categoryId,
        categoryName = obj.optStringSafe("category_name", obj.optStringSafe("category", "Collection")),
        regularPrice = regularPrice,
        salePrice = salePrice,
        stockQuantity = stockQuantity,
        sku = obj.optStringSafe("sku", obj.optStringSafe("product_sku")),
        shortDesc = obj.optStringSafe("short_desc", obj.optStringSafe("short_description", obj.optStringSafe("description"))),
        imageUrl = firstProductImage(images),
        isFeatured = obj.optInt("is_featured") == 1,
        isTrending = obj.optInt("is_trending") == 1,
        images = imagePaths,
        description = obj.optStringSafe("description", obj.optStringSafe("short_desc")),
        isSellable = obj.optInt("is_sellable", 1) == 1,
        seoTitle = obj.optStringSafe("seo_title"),
        metaDescription = obj.optStringSafe("meta_description"),
        focusKeyword = obj.optStringSafe("focus_keyword"),
        h1 = obj.optStringSafe("h1"),
        altText = obj.optStringSafe("alt_text"),
        canonicalUrl = obj.optStringSafe("canonical_url"),
    )
}

class ProductRepositoryImpl(private val api: ApiClient) : ProductRepository {
    override suspend fun getProducts(category: String?, query: String?): Result<List<Product>> {
        val params = mutableMapOf("include_unavailable" to "1")
        if (!category.isNullOrBlank()) params["category"] = category
        if (!query.isNullOrBlank()) params["q"] = query

        return api.get("products", params).mapCatching { json ->
            val data = json.getJSONArray("data")
            List(data.length()) { index -> parseProduct(data.getJSONObject(index)) }
        }
    }

    override suspend fun getProductById(id: Long): Result<Product> {
        return api.get("products", mapOf("id" to id.toString(), "include_unavailable" to "1")).mapCatching { json ->
            parseProduct(json.getJSONObject("data"))
        }
    }

    override suspend fun createProduct(
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
        isSellable: Boolean,
        seoTitle: String,
        metaDescription: String,
        focusKeyword: String,
        h1: String,
        altText: String,
        canonicalUrl: String,
        imageFiles: List<ProductImageFile>,
    ): Result<Long> {
        productPricingError(regularPrice, salePrice)?.let {
            return Result.failure(IllegalArgumentException(it))
        }
        productSeoValidationError(seoTitle, metaDescription, focusKeyword, h1, altText, canonicalUrl)?.let {
            return Result.failure(IllegalArgumentException(it))
        }
        if (name.isBlank() || categoryId <= 0L || stock < 0) {
            return Result.failure(IllegalArgumentException("Enter a product name, valid category, and non-negative stock."))
        }
        if (imageFiles.size > MAX_PRODUCT_IMAGES) {
            return Result.failure(IllegalArgumentException("A product can have up to $MAX_PRODUCT_IMAGES images."))
        }

        val imageUrls = if (imageFiles.isEmpty()) {
            Result.success(emptyList())
        } else {
            api.uploadProductImages(imageFiles)
        }
        if (imageUrls.isFailure) {
            return Result.failure(imageUrls.exceptionOrNull() ?: Exception("Could not upload product images"))
        }

        val body = JSONObject().apply {
            put("name", name)
            put("short_desc", shortDescription)
            put("regular_price", regularPrice)
            if (salePrice != null) put("sale_price", salePrice) else put("sale_price", JSONObject.NULL)
            put("category_id", categoryId)
            put("stock_quantity", stock)
            if (!sku.isNullOrBlank()) put("sku", sku)
            put("description", description)
            put("is_featured", if (isFeatured) 1 else 0)
            put("is_trending", if (isTrending) 1 else 0)
            put("is_sellable", isSellable)
            put("seo_title", seoTitle)
            put("meta_description", metaDescription)
            put("focus_keyword", focusKeyword)
            put("h1", h1)
            put("alt_text", altText)
            put("canonical_url", canonicalUrl)
            val jsonArr = JSONArray()
            imageUrls.getOrThrow().forEach { jsonArr.put(it) }
            put("images", jsonArr)
        }
        return api.post("products", body, UUID.randomUUID().toString()).mapCatching { json ->
            json.getLong("id").also { require(it > 0L) { "Product creation returned an invalid ID." } }
        }
    }

    override suspend fun updateProduct(
        id: Long,
        name: String,
        categoryId: Long,
        shortDescription: String,
        description: String,
        regularPrice: Double,
        salePrice: Double?,
        stock: Int,
        expectedStock: Int,
        sku: String?,
        isFeatured: Boolean,
        isTrending: Boolean,
        isSellable: Boolean,
        seoTitle: String,
        metaDescription: String,
        focusKeyword: String,
        h1: String,
        altText: String,
        canonicalUrl: String,
        images: List<String>,
        imageFiles: List<ProductImageFile>,
    ): Result<Unit> {
        productPricingError(regularPrice, salePrice)?.let {
            return Result.failure(IllegalArgumentException(it))
        }
        productSeoValidationError(seoTitle, metaDescription, focusKeyword, h1, altText, canonicalUrl)?.let {
            return Result.failure(IllegalArgumentException(it))
        }
        if (id <= 0L || name.isBlank() || categoryId <= 0L || stock < 0 || expectedStock < 0) {
            return Result.failure(IllegalArgumentException("Enter a product name, valid category, and non-negative stock."))
        }
        if (images.size + imageFiles.size > MAX_PRODUCT_IMAGES || images.any(String::isBlank)) {
            return Result.failure(IllegalArgumentException("A product can have up to $MAX_PRODUCT_IMAGES valid images."))
        }

        val uploadedImages = if (imageFiles.isEmpty()) {
            Result.success(emptyList())
        } else {
            api.uploadProductImages(imageFiles)
        }
        if (uploadedImages.isFailure) {
            return Result.failure(uploadedImages.exceptionOrNull() ?: Exception("Could not upload product images."))
        }

        val body = JSONObject().apply {
            put("id", id)
            put("name", name)
            put("category_id", categoryId)
            put("short_desc", shortDescription)
            put("description", description)
            put("regular_price", regularPrice)
            if (salePrice != null) put("sale_price", salePrice) else put("sale_price", JSONObject.NULL)
            if (stock != expectedStock) {
                put("stock_quantity", stock)
                put("expected_stock", expectedStock)
            }
            put("sku", sku ?: JSONObject.NULL)
            put("is_featured", isFeatured)
            put("is_trending", isTrending)
            put("is_sellable", isSellable)
            put("seo_title", seoTitle)
            put("meta_description", metaDescription)
            put("focus_keyword", focusKeyword)
            put("h1", h1)
            put("alt_text", altText)
            put("canonical_url", canonicalUrl)
            put("images", JSONArray().apply {
                (images + uploadedImages.getOrThrow()).forEach { path -> put(path) }
            })
        }
        val idempotencyKey = if (stock != expectedStock) UUID.randomUUID().toString() else null
        return api.put("products", body, idempotencyKey).map { }
    }

    override suspend fun deleteProduct(id: Long): Result<Unit> {
        return api.delete("products", mapOf("id" to id.toString())).map { }
    }
}

class OrderRepositoryImpl(private val api: ApiClient) : OrderRepository {
    override suspend fun getOrders(
        status: String?,
        query: String?,
        page: Int,
        perPage: Int,
    ): Result<PaginatedOrders> {
        val params = mutableMapOf<String, String>()
        if (!status.isNullOrBlank()) params["status"] = status
        if (!query.isNullOrBlank()) params["q"] = query
        params["page"] = page.toString()
        params["per_page"] = perPage.toString()

        return api.get("orders", params).map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val paginationObj = json.optJSONObject("pagination")
            val pageNum = paginationObj?.optInt("page", page) ?: page
            val perPageNum = paginationObj?.optInt("per_page", perPage) ?: perPage
            val totalCount = paginationObj?.optInt("total", data.length()) ?: data.length()

            val list = mutableListOf<Order>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                val itemsArr = obj.optJSONArray("items") ?: JSONArray()
                val itemsList = mutableListOf<OrderItem>()
                for (j in 0 until itemsArr.length()) {
                    val itObj = itemsArr.getJSONObject(j)
                    itemsList.add(
                        OrderItem(
                            productId = itObj.optLong("product_id"),
                            productName = itObj.optStringSafe("product_name"),
                            price = itObj.optDouble("price"),
                            quantity = itObj.optInt("quantity", 1),
                            total = itObj.optDouble("total"),
                        ),
                    )
                }

                list.add(
                    Order(
                        id = obj.optLong("id"),
                        orderNumber = obj.optStringSafe("order_number"),
                        customerName = obj.optStringSafe("customer_name"),
                        customerPhone = obj.optStringSafe("customer_phone"),
                        customerEmail = obj.optStringSafe("customer_email"),
                        deliveryAddress = obj.optStringSafe("delivery_address"),
                        deliveryArea = obj.optStringSafe("delivery_area"),
                        deliveryFee = obj.optDouble("delivery_fee", 60.0),
                        subtotal = obj.optDouble("subtotal"),
                        discount = obj.optDouble("discount", 0.0),
                        total = obj.optDouble("total"),
                        paymentMethod = obj.optStringSafe("payment_method"),
                        paymentStatus = obj.optStringSafe("payment_status"),
                        trxId = if (obj.has("trx_id") && !obj.isNull("trx_id")) obj.optString("trx_id") else null,
                        orderStatus = obj.optStringSafe("order_status", "Pending"),
                        trackingCode = obj.optStringSafe("tracking_code"),
                        notes = if (obj.has("notes") && !obj.isNull("notes")) obj.optString("notes") else null,
                        createdAt = obj.optStringSafe("created_at"),
                        items = itemsList,
                    ),
                )
            }
            PaginatedOrders(orders = list, page = pageNum, perPage = perPageNum, total = totalCount)
        }
    }

    override suspend fun getOrderById(id: Long): Result<Order> {
        return api.get("orders", mapOf("id" to id.toString())).mapCatching { json ->
            if (json.has("error") && !json.isNull("error")) {
                throw NoSuchElementException(json.optString("error"))
            }
            val obj = json.optJSONObject("data")
                ?: json.optJSONArray("data")?.optJSONObject(0)
                ?: throw NoSuchElementException("Order $id not found")
            val itemsArr = obj.optJSONArray("items") ?: JSONArray()
            val itemsList = mutableListOf<OrderItem>()
            for (j in 0 until itemsArr.length()) {
                val itObj = itemsArr.getJSONObject(j)
                itemsList.add(
                    OrderItem(
                        productId = itObj.optLong("product_id"),
                        productName = itObj.optStringSafe("product_name"),
                        price = itObj.optDouble("price"),
                        quantity = itObj.optInt("quantity", 1),
                        total = itObj.optDouble("total"),
                    ),
                )
            }
            Order(
                id = obj.optLong("id"),
                orderNumber = obj.optStringSafe("order_number"),
                customerName = obj.optStringSafe("customer_name"),
                customerPhone = obj.optStringSafe("customer_phone"),
                customerEmail = obj.optStringSafe("customer_email"),
                deliveryAddress = obj.optStringSafe("delivery_address"),
                deliveryArea = obj.optStringSafe("delivery_area"),
                deliveryFee = obj.optDouble("delivery_fee", 60.0),
                subtotal = obj.optDouble("subtotal"),
                discount = obj.optDouble("discount", 0.0),
                total = obj.optDouble("total"),
                paymentMethod = obj.optStringSafe("payment_method"),
                paymentStatus = obj.optStringSafe("payment_status"),
                trxId = if (obj.has("trx_id") && !obj.isNull("trx_id")) obj.optString("trx_id") else null,
                orderStatus = obj.optStringSafe("order_status", "Pending"),
                trackingCode = obj.optStringSafe("tracking_code"),
                notes = if (obj.has("notes") && !obj.isNull("notes")) obj.optString("notes") else null,
                createdAt = obj.optStringSafe("created_at"),
                items = itemsList,
            )
        }
    }

    override suspend fun updateOrderStatus(id: Long, status: String): Result<Unit> {
        val body = JSONObject().apply {
            put("id", id)
            put("order_status", status)
        }
        return api.put("orders", body).map { }
    }
}

class InventoryRepositoryImpl(private val api: ApiClient) : InventoryRepository {
    override suspend fun getInventory(): Result<List<InventoryItem>> {
        return api.get("inventory").map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val list = mutableListOf<InventoryItem>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                list.add(
                    InventoryItem(
                        id = obj.optLong("id"),
                        name = obj.optStringSafe("name"),
                        sku = obj.optStringSafe("sku"),
                        stockQuantity = obj.optInt("stock_quantity"),
                        regularPrice = obj.optDouble("regular_price"),
                        salePrice = if (obj.has("sale_price") && !obj.isNull("sale_price")) obj.optDouble("sale_price") else null,
                        categoryName = obj.optStringSafe("category_name", "Collection"),
                        stockStatus = obj.optStringSafe("stock_status", "In Stock"),
                    ),
                )
            }
            list
        }
    }

    override suspend fun adjustStock(productId: Long, delta: Int): Result<Unit> {
        val body = JSONObject().apply {
            put("product_id", productId)
            put("action", "adjust")
            put("delta", delta)
        }
        return api.post("inventory", body, UUID.randomUUID().toString()).map { }
    }

    override suspend fun setStock(productId: Long, exactQuantity: Int, expectedStock: Int): Result<Unit> {
        val body = JSONObject().apply {
            put("product_id", productId)
            put("stock_quantity", exactQuantity)
            put("expected_stock", expectedStock)
        }
        return api.post("inventory", body, UUID.randomUUID().toString()).map { }
    }
}

class DashboardRepositoryImpl(private val api: ApiClient) : DashboardRepository {
    override suspend fun getDashboardOverview(): Result<DashboardOverview> {
        return api.get("reports").mapCatching { json ->
            val data = json.optJSONObject("data") ?: json
            val ov = data.optJSONObject("overview") ?: data
            val revenue = when {
                ov.has("paid_order_revenue") && !ov.isNull("paid_order_revenue") -> ov.optDouble("paid_order_revenue", 0.0)
                else -> ov.optDouble("gross_revenue", 0.0)
            }
            val avgOrderVal = when {
                ov.has("average_paid_order_value") && !ov.isNull("average_paid_order_value") -> ov.optDouble("average_paid_order_value", 0.0)
                else -> ov.optDouble("average_order_value", 0.0)
            }
            val statusBreakdown = data.optJSONArray("status_breakdown")?.let { statuses ->
                (0 until statuses.length()).map { index ->
                    val item = statuses.optJSONObject(index)
                        ?: throw IllegalStateException("The server returned an invalid order-status summary.")
                    val status = item.optStringSafe("order_status")
                    val count = item.optInt("count", -1)
                    val orderValue = item.optDouble("order_value", Double.NaN)
                    if (status.isBlank() || count < 0 || !orderValue.isFinite() || orderValue < 0.0) {
                        throw IllegalStateException("The server returned an invalid order-status summary.")
                    }
                    DashboardOrderStatus(status, count, orderValue)
                }
            }.orEmpty()
            val recentOrders = data.optJSONArray("recent_orders")?.let { orders ->
                (0 until orders.length()).map { index ->
                    val item = orders.optJSONObject(index)
                        ?: throw IllegalStateException("The server returned an invalid recent-order item.")
                    val order = DashboardRecentOrder(
                        id = item.optLong("id", -1),
                        orderNumber = item.optStringSafe("order_number"),
                        customerName = item.optStringSafe("customer_name"),
                        deliveryArea = item.optStringSafe("delivery_area"),
                        total = item.optDouble("total", Double.NaN),
                        orderStatus = item.optStringSafe("order_status"),
                        createdAt = item.optStringSafe("created_at"),
                    )
                    if (
                        order.id <= 0 ||
                        order.orderNumber.isBlank() ||
                        order.orderStatus.isBlank() ||
                        !order.total.isFinite() ||
                        order.total < 0.0
                    ) {
                        throw IllegalStateException("The server returned an invalid recent-order item.")
                    }
                    order
                }
            }.orEmpty()
            DashboardOverview(
                grossRevenue = revenue,
                totalOrders = ov.optInt("total_orders", 0),
                averageOrderValue = avgOrderVal,
                totalDiscounts = ov.optDouble("total_discounts", 0.0),
                totalCustomers = ov.optInt("total_customers", 0),
                lowStockAlerts = ov.optInt("low_stock_alerts", 0),
                pendingOrders = ov.optInt("pending_orders", 0),
                pendingPaymentVerification = ov.optInt("pending_payment_verification", 0),
                statusBreakdown = statusBreakdown,
                recentOrders = recentOrders,
            )
        }
    }
}

class CategoryRepositoryImpl(private val api: ApiClient) : CategoryRepository {
    override suspend fun getCategories(): Result<List<Category>> {
        return api.get("categories").map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val list = mutableListOf<Category>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                list.add(
                    Category(
                        id = obj.optLong("id"),
                        name = obj.optStringSafe("name"),
                        slug = obj.optStringSafe("slug"),
                        description = obj.optStringSafe("description"),
                        imageUrl = obj.optStringSafe("image"),
                        productCount = obj.optInt("product_count", 0),
                    ),
                )
            }
            list
        }
    }

    override suspend fun createCategory(name: String, slug: String): Result<Long> {
        val body = JSONObject().apply {
            put("name", name)
            put("slug", slug)
        }
        return api.post("categories", body).map { it.optLong("id") }
    }
}

class CustomerRepositoryImpl(private val api: ApiClient) : CustomerRepository {
    override suspend fun getCustomers(): Result<List<Customer>> {
        return api.get("customers").map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val list = mutableListOf<Customer>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                list.add(
                    Customer(
                        id = obj.optLong("id"),
                        name = obj.optStringSafe("name"),
                        email = obj.optStringSafe("email"),
                        phone = obj.optStringSafe("phone"),
                        address = obj.optStringSafe("address"),
                        area = obj.optStringSafe("area", "Dhaka"),
                        city = obj.optStringSafe("city", "Dhaka"),
                        totalOrders = obj.optInt("total_orders", 1),
                        totalSpent = obj.optDouble("total_spent", 0.0)
                    )
                )
            }
            list
        }
    }
}

class CouponRepositoryImpl(private val api: ApiClient) : CouponRepository {
    override suspend fun getCoupons(): Result<List<Coupon>> {
        return api.get("coupons").map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val list = mutableListOf<Coupon>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                list.add(
                    Coupon(
                        id = obj.optLong("id"),
                        code = obj.optStringSafe("code"),
                        type = obj.optStringSafe("type", "percentage"),
                        value = obj.optDouble("value"),
                        minOrder = obj.optDouble("min_order"),
                        maxDiscount = if (obj.has("max_discount") && !obj.isNull("max_discount")) obj.optDouble("max_discount") else null,
                        expiryDate = obj.optStringSafe("expiry_date", "2028-12-31"),
                        usageLimit = obj.optInt("usage_limit", 0),
                        timesUsed = obj.optInt("times_used", 0),
                        isActive = obj.optInt("is_active", 1) == 1
                    )
                )
            }
            list
        }
    }

    override suspend fun createCoupon(code: String, type: String, value: Double, minOrder: Double): Result<Long> {
        val body = JSONObject().apply {
            put("code", code)
            put("type", type)
            put("value", value)
            put("min_order", minOrder)
        }
        return api.post("coupons", body).map { it.optLong("id") }
    }
}

class SettingsRepositoryImpl(private val api: ApiClient) : SettingsRepository {
    override suspend fun getSettings(): Result<StoreSettings> {
        return api.get("settings").map { json ->
            val data = json.getJSONObject("data")
            StoreSettings(
                storeName = data.optString("store_name", "Shopademia"),
                storePhone = data.optString("store_phone", "+880 1560-024777"),
                storeEmail = data.optString("store_email", "contact@shopademia.store"),
                storeAddress = data.optString("store_address", "DHAKA, BANGLADESH"),
                deliveryFeeLocalDhaka = data.optDouble("delivery_fee_local_dhaka", 60.0),
                deliveryFeeDhaka = data.optDouble("delivery_fee_dhaka", 80.0),
                deliveryFeeOutsideDhaka = data.optDouble("delivery_fee_outside_dhaka", 130.0),
                bkashNumber = data.optString("bkash_number", "01560024777"),
                nagadNumber = data.optString("nagad_number", "01560024777"),
                announcementText = data.optStringSafe("announcement_text")
            )
        }
    }

    override suspend fun updateSettings(settings: Map<String, String>): Result<Unit> {
        val body = JSONObject()
        settings.forEach { (k, v) -> body.put(k, v) }
        return api.post("settings", body).map { }
    }
}
