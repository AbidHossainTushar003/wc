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

internal fun JSONObject.optStringAny(vararg keys: String): String {
    for (key in keys) {
        if (has(key) && !isNull(key)) {
            val value = optString(key)
            if (value.isNotBlank()) return value
        }
    }
    return ""
}

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
    val id = obj.optLong("id", obj.optLong("product_id", 0L))
    val name = obj.optString("name", obj.optString("product_name", "")).trim()
    val categoryId = obj.optLong("category_id", obj.optLong("categoryId", 0L))
    val regularPrice = obj.optDouble("regular_price", obj.optDouble("regularPrice", obj.optDouble("price", 0.0)))
    val stockQuantity = obj.optInt("stock_quantity", obj.optInt("stock", obj.optInt("stockQuantity", 0)))
    require(id > 0L && name.isNotBlank()) { "Product response is missing required identity fields." }
    require(regularPrice.isFinite() && regularPrice > 0.0 && stockQuantity >= 0) {
        "Product response contains invalid price or stock data."
    }

    val images = when {
        obj.has("images") && !obj.isNull("images") -> obj.optJSONArray("images")
        obj.has("image") && !obj.isNull("image") -> JSONArray().apply { put(obj.optString("image")) }
        obj.has("image_url") && !obj.isNull("image_url") -> JSONArray().apply { put(obj.optString("image_url")) }
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
                is JSONObject -> value.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb")
                    .takeIf(String::isNotBlank)
                    ?: throw IllegalArgumentException("Product response contains an empty image path.")
                else -> value?.toString()?.takeIf(String::isNotBlank)
                    ?: throw IllegalArgumentException("Product response contains an empty image path.")
            }
        }
    }.orEmpty()
    val salePrice = listOf("sale_price", "salePrice", "special_price", "discount_price")
        .firstOrNull { obj.has(it) && !obj.isNull(it) }
        ?.let { obj.optDouble(it, Double.NaN) }
        ?.takeIf { it.isFinite() && it > 0.0 }
    require(salePrice == null || (salePrice.isFinite() && salePrice > 0.0 && salePrice < regularPrice)) {
        "Product response contains an invalid sale price."
    }

    val categoryName = obj.optStringSafe("category_name", obj.optStringSafe("categoryName", obj.optStringSafe("category", "Collection")))
    val shortDescription = obj.optStringSafe(
        "short_desc",
        obj.optStringSafe("short_description", obj.optStringSafe("shortDesc", obj.optStringSafe("description", ""))),
    )

    return Product(
        id = id,
        name = name,
        slug = obj.optStringSafe("slug"),
        categoryId = categoryId,
        categoryName = categoryName,
        regularPrice = regularPrice,
        salePrice = salePrice,
        stockQuantity = stockQuantity,
        sku = obj.optStringSafe("sku", obj.optStringSafe("product_sku")),
        shortDesc = shortDescription,
        imageUrl = firstProductImage(images),
        isFeatured = obj.optInt("is_featured") == 1,
        isTrending = obj.optInt("is_trending") == 1,
        images = imagePaths,
        description = obj.optStringSafe("description", obj.optStringSafe("short_desc", shortDescription)),
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
                            productId = itObj.optLong("product_id", itObj.optLong("productId", 0L)),
                            productName = itObj.optStringSafe("product_name", itObj.optStringSafe("productName", itObj.optStringSafe("name", "Product"))),
                            price = itObj.optDouble("price", itObj.optDouble("unit_price", 0.0)),
                            quantity = itObj.optInt("quantity", itObj.optInt("qty", 1)),
                            total = itObj.optDouble("total", itObj.optDouble("line_total", 0.0)),
                        ),
                    )
                }

                list.add(
                    Order(
                        id = obj.optLong("id", obj.optLong("order_id", 0L)),
                        orderNumber = obj.optStringSafe("order_number", obj.optStringSafe("orderNumber", obj.optStringSafe("tracking_code"))),
                        customerName = obj.optStringSafe("customer_name", obj.optStringSafe("customerName", obj.optStringSafe("name", "Customer"))),
                        customerPhone = obj.optStringSafe("customer_phone", obj.optStringSafe("customerPhone", obj.optStringSafe("phone"))),
                        customerEmail = obj.optStringSafe("customer_email", obj.optStringSafe("customerEmail", obj.optStringSafe("email"))),
                        deliveryAddress = obj.optStringSafe("delivery_address", obj.optStringSafe("deliveryAddress", obj.optStringSafe("address"))),
                        deliveryArea = obj.optStringSafe("delivery_area", obj.optStringSafe("deliveryArea", obj.optStringSafe("area"))),
                        deliveryFee = obj.optDouble("delivery_fee", obj.optDouble("deliveryFee", 60.0)),
                        subtotal = obj.optDouble("subtotal", obj.optDouble("sub_total", 0.0)),
                        discount = obj.optDouble("discount", obj.optDouble("discount_amount", 0.0)),
                        total = obj.optDouble("total", obj.optDouble("grand_total", 0.0)),
                        paymentMethod = obj.optStringSafe("payment_method", obj.optStringSafe("paymentMethod", obj.optStringSafe("method"))),
                        paymentStatus = obj.optStringSafe("payment_status", obj.optStringSafe("paymentStatus", obj.optStringSafe("status"))),
                        trxId = if (obj.has("trx_id") && !obj.isNull("trx_id")) obj.optString("trx_id") else if (obj.has("trxId") && !obj.isNull("trxId")) obj.optString("trxId") else null,
                        orderStatus = obj.optStringSafe("order_status", obj.optStringSafe("orderStatus", obj.optStringSafe("status", "Pending"))),
                        trackingCode = obj.optStringSafe("tracking_code", obj.optStringSafe("trackingCode")),
                        notes = if (obj.has("notes") && !obj.isNull("notes")) obj.optString("notes") else null,
                        createdAt = obj.optStringSafe("created_at", obj.optStringSafe("createdAt")),
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
                        productId = itObj.optLong("product_id", itObj.optLong("productId", 0L)),
                        productName = itObj.optStringSafe("product_name", itObj.optStringSafe("productName", itObj.optStringSafe("name", "Product"))),
                        price = itObj.optDouble("price", itObj.optDouble("unit_price", 0.0)),
                        quantity = itObj.optInt("quantity", itObj.optInt("qty", 1)),
                        total = itObj.optDouble("total", itObj.optDouble("line_total", 0.0)),
                    ),
                )
            }
            Order(
                id = obj.optLong("id", obj.optLong("order_id", 0L)),
                orderNumber = obj.optStringSafe("order_number", obj.optStringSafe("orderNumber", obj.optStringSafe("tracking_code"))),
                customerName = obj.optStringSafe("customer_name", obj.optStringSafe("customerName", obj.optStringSafe("name", "Customer"))),
                customerPhone = obj.optStringSafe("customer_phone", obj.optStringSafe("customerPhone", obj.optStringSafe("phone"))),
                customerEmail = obj.optStringSafe("customer_email", obj.optStringSafe("customerEmail", obj.optStringSafe("email"))),
                deliveryAddress = obj.optStringSafe("delivery_address", obj.optStringSafe("deliveryAddress", obj.optStringSafe("address"))),
                deliveryArea = obj.optStringSafe("delivery_area", obj.optStringSafe("deliveryArea", obj.optStringSafe("area"))),
                deliveryFee = obj.optDouble("delivery_fee", obj.optDouble("deliveryFee", 60.0)),
                subtotal = obj.optDouble("subtotal", obj.optDouble("sub_total", 0.0)),
                discount = obj.optDouble("discount", obj.optDouble("discount_amount", 0.0)),
                total = obj.optDouble("total", obj.optDouble("grand_total", 0.0)),
                paymentMethod = obj.optStringSafe("payment_method", obj.optStringSafe("paymentMethod", obj.optStringSafe("method"))),
                paymentStatus = obj.optStringSafe("payment_status", obj.optStringSafe("paymentStatus", obj.optStringSafe("status"))),
                trxId = if (obj.has("trx_id") && !obj.isNull("trx_id")) obj.optString("trx_id") else if (obj.has("trxId") && !obj.isNull("trxId")) obj.optString("trxId") else null,
                orderStatus = obj.optStringSafe("order_status", obj.optStringSafe("orderStatus", obj.optStringSafe("status", "Pending"))),
                trackingCode = obj.optStringSafe("tracking_code", obj.optStringSafe("trackingCode")),
                notes = if (obj.has("notes") && !obj.isNull("notes")) obj.optString("notes") else null,
                createdAt = obj.optStringSafe("created_at", obj.optStringSafe("createdAt")),
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
                val categoryValue = obj.opt("category")
                val categoryName = when (categoryValue) {
                    is JSONObject -> categoryValue.optStringAny("name", "title", "category_name")
                    is String -> categoryValue
                    else -> obj.optStringSafe("category_name", obj.optStringSafe("categoryName", "Collection"))
                }
                list.add(
                    InventoryItem(
                        id = obj.optLong("id"),
                        name = obj.optStringSafe("name", obj.optStringSafe("product_name")),
                        sku = obj.optStringSafe("sku", obj.optStringSafe("product_sku")),
                        stockQuantity = obj.optInt("stock_quantity", obj.optInt("stock", obj.optInt("stockQuantity", 0))),
                        regularPrice = obj.optDouble("regular_price", obj.optDouble("regularPrice", obj.optDouble("price", 0.0))),
                        salePrice = listOf("sale_price", "salePrice", "special_price", "discount_price")
                            .firstOrNull { obj.has(it) && !obj.isNull(it) }
                            ?.let { obj.optDouble(it, Double.NaN) }
                            ?.takeIf { it.isFinite() && it > 0.0 },
                        categoryName = categoryName.ifBlank { "Collection" },
                        stockStatus = obj.optStringSafe("stock_status", obj.optStringSafe("status", "In Stock")),
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
                val imageValue = when (val rawImage = obj.opt("image")) {
                    is JSONObject -> rawImage.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb")
                    is String -> rawImage
                    else -> obj.optStringSafe("image_url", obj.optStringSafe("thumbnail", obj.optStringSafe("category_image")))
                }
                val thumbnailValue = when (val rawThumb = obj.opt("thumbnail")) {
                    is JSONObject -> rawThumb.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb")
                    is String -> rawThumb
                    else -> ""
                }
                val imageUrl = (imageValue.ifBlank { thumbnailValue }).ifBlank {
                    obj.optStringSafe("image_url", obj.optStringSafe("category_image"))
                }
                list.add(
                    Category(
                        id = obj.optLong("id"),
                        name = obj.optStringSafe("name", obj.optStringSafe("category_name", obj.optStringSafe("title"))),
                        slug = obj.optStringSafe("slug", obj.optStringSafe("category_slug")),
                        description = obj.optStringSafe("description", obj.optStringSafe("short_description")),
                        imageUrl = imageUrl,
                        productCount = obj.optInt("product_count", obj.optInt("products_count", obj.optInt("count", 0))),
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
                val customerPayload = obj.opt("customer")
                val shippingPayload = obj.opt("shipping")
                val name = when (customerPayload) {
                    is JSONObject -> customerPayload.optStringAny("name", "full_name", "customer_name")
                    else -> obj.optStringSafe("name", obj.optStringSafe("customer_name", obj.optStringSafe("full_name")))
                }
                val email = when (customerPayload) {
                    is JSONObject -> customerPayload.optStringAny("email", "customer_email")
                    else -> obj.optStringSafe("email", obj.optStringSafe("customer_email"))
                }
                val phone = when (customerPayload) {
                    is JSONObject -> customerPayload.optStringAny("phone", "customer_phone")
                    else -> obj.optStringSafe("phone", obj.optStringSafe("customer_phone"))
                }
                val address = when (shippingPayload) {
                    is JSONObject -> shippingPayload.optStringAny("address", "delivery_address", "shipping_address")
                    else -> obj.optStringSafe("address", obj.optStringSafe("delivery_address", obj.optStringSafe("shipping_address")))
                }
                val area = when (shippingPayload) {
                    is JSONObject -> shippingPayload.optStringAny("area", "delivery_area", "area_name")
                    else -> obj.optStringSafe("area", obj.optStringSafe("delivery_area", obj.optStringSafe("area_name", "Dhaka")))
                }
                val city = when (shippingPayload) {
                    is JSONObject -> shippingPayload.optStringAny("city", "city_name")
                    else -> obj.optStringSafe("city", obj.optStringSafe("city_name", "Dhaka"))
                }
                list.add(
                    Customer(
                        id = obj.optLong("id"),
                        name = name,
                        email = email,
                        phone = phone,
                        address = address,
                        area = area,
                        city = city,
                        totalOrders = obj.optInt("total_orders", obj.optInt("orders_count", obj.optInt("totalOrders", 1))),
                        totalSpent = obj.optDouble("total_spent", obj.optDouble("totalSpent", obj.optDouble("spent", 0.0)))
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
                        code = obj.optStringSafe("code", obj.optStringSafe("coupon_code")),
                        type = obj.optStringSafe("type", obj.optStringSafe("discount_type", "percentage")),
                        value = obj.optDouble("value", obj.optDouble("discount_value", 0.0)),
                        minOrder = obj.optDouble("min_order", obj.optDouble("minimum_order", 0.0)),
                        maxDiscount = if (obj.has("max_discount") && !obj.isNull("max_discount")) obj.optDouble("max_discount") else if (obj.has("maxDiscount") && !obj.isNull("maxDiscount")) obj.optDouble("maxDiscount") else null,
                        expiryDate = obj.optStringSafe("expiry_date", obj.optStringSafe("expires_at", "2028-12-31")),
                        usageLimit = obj.optInt("usage_limit", obj.optInt("usageLimit", 0)),
                        timesUsed = obj.optInt("times_used", obj.optInt("used_count", 0)),
                        isActive = obj.optInt("is_active", obj.optInt("isActive", 1)) == 1
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
                storeName = data.optString("store_name", data.optString("name", "Shopademia")),
                storePhone = data.optString("store_phone", data.optString("phone", "+880 1560-024777")),
                storeEmail = data.optString("store_email", data.optString("email", "contact@shopademia.store")),
                storeAddress = data.optString("store_address", data.optString("address", "DHAKA, BANGLADESH")),
                deliveryFeeLocalDhaka = data.optDouble("delivery_fee_local_dhaka", data.optDouble("localDhakaFee", 60.0)),
                deliveryFeeDhaka = data.optDouble("delivery_fee_dhaka", data.optDouble("dhakaFee", 80.0)),
                deliveryFeeOutsideDhaka = data.optDouble("delivery_fee_outside_dhaka", data.optDouble("outsideDhakaFee", 130.0)),
                bkashNumber = data.optString("bkash_number", data.optString("bkash", "01560024777")),
                nagadNumber = data.optString("nagad_number", data.optString("nagad", "01560024777")),
                announcementText = data.optStringSafe("announcement_text", data.optStringSafe("announcement"))
            )
        }
    }

    override suspend fun updateSettings(settings: Map<String, String>): Result<Unit> {
        val body = JSONObject()
        settings.forEach { (k, v) -> body.put(k, v) }
        return api.post("settings", body).map { }
    }
}
