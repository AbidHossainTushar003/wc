package store.wonderfulcollection.admin.data.repository

import org.json.JSONArray
import org.json.JSONObject
import store.wonderfulcollection.admin.data.api.ApiClient
import store.wonderfulcollection.admin.domain.model.*
import store.wonderfulcollection.admin.domain.repository.*

class ProductRepositoryImpl(private val api: ApiClient) : ProductRepository {
    override suspend fun getProducts(category: String?, query: String?): Result<List<Product>> {
        val params = mutableMapOf<String, String>()
        if (!category.isNullOrBlank()) params["category"] = category
        if (!query.isNullOrBlank()) params["q"] = query

        return api.get("products", params).map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
            val list = mutableListOf<Product>()
            for (i in 0 until data.length()) {
                val obj = data.getJSONObject(i)
                val imagesJson = obj.optJSONArray("images")
                val img = if (imagesJson != null && imagesJson.length() > 0) imagesJson.getString(0) else "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&q=80"
                list.add(
                    Product(
                        id = obj.optLong("id"),
                        name = obj.optString("name"),
                        slug = obj.optString("slug"),
                        categoryId = obj.optLong("category_id"),
                        categoryName = obj.optString("category_name", "Collection"),
                        regularPrice = obj.optDouble("regular_price"),
                        salePrice = if (obj.has("sale_price") && !obj.isNull("sale_price")) obj.optDouble("sale_price") else null,
                        stockQuantity = obj.optInt("stock_quantity", 10),
                        sku = obj.optString("sku"),
                        shortDesc = obj.optString("short_desc"),
                        imageUrl = img,
                        isFeatured = obj.optInt("is_featured") == 1,
                        isTrending = obj.optInt("is_trending") == 1
                    )
                )
            }
            list
        }
    }

    override suspend fun getProductById(id: Long): Result<Product> {
        return api.get("products", mapOf("id" to id.toString())).map { json ->
            val obj = json.getJSONObject("data")
            Product(
                id = obj.optLong("id"),
                name = obj.optString("name"),
                slug = obj.optString("slug"),
                categoryId = obj.optLong("category_id"),
                categoryName = obj.optString("category_name"),
                regularPrice = obj.optDouble("regular_price"),
                salePrice = if (obj.has("sale_price") && !obj.isNull("sale_price")) obj.optDouble("sale_price") else null,
                stockQuantity = obj.optInt("stock_quantity"),
                sku = obj.optString("sku"),
                shortDesc = obj.optString("short_desc"),
                imageUrl = "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&q=80",
                isFeatured = obj.optInt("is_featured") == 1,
                isTrending = obj.optInt("is_trending") == 1
            )
        }
    }

    override suspend fun createProduct(name: String, price: Double, categoryId: Long, stock: Int): Result<Long> {
        val body = JSONObject().apply {
            put("name", name)
            put("regular_price", price)
            put("category_id", categoryId)
            put("stock_quantity", stock)
        }
        return api.post("products", body).map { json ->
            json.optLong("id", System.currentTimeMillis())
        }
    }

    override suspend fun deleteProduct(id: Long): Result<Unit> {
        return api.delete("products", mapOf("id" to id.toString())).map { }
    }
}

class OrderRepositoryImpl(private val api: ApiClient) : OrderRepository {
    override suspend fun getOrders(status: String?, query: String?): Result<List<Order>> {
        val params = mutableMapOf<String, String>()
        if (!status.isNullOrBlank()) params["status"] = status
        if (!query.isNullOrBlank()) params["q"] = query

        return api.get("orders", params).map { json ->
            val data = json.optJSONArray("data") ?: JSONArray()
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
                            productName = itObj.optString("product_name"),
                            price = itObj.optDouble("price"),
                            quantity = itObj.optInt("quantity", 1),
                            total = itObj.optDouble("total")
                        )
                    )
                }

                list.add(
                    Order(
                        id = obj.optLong("id"),
                        orderNumber = obj.optString("order_number"),
                        customerName = obj.optString("customer_name"),
                        customerPhone = obj.optString("customer_phone"),
                        customerEmail = obj.optString("customer_email"),
                        deliveryAddress = obj.optString("delivery_address"),
                        deliveryArea = obj.optString("delivery_area"),
                        deliveryFee = obj.optDouble("delivery_fee", 60.0),
                        subtotal = obj.optDouble("subtotal"),
                        discount = obj.optDouble("discount", 0.0),
                        total = obj.optDouble("total"),
                        paymentMethod = obj.optString("payment_method"),
                        paymentStatus = obj.optString("payment_status"),
                        trxId = obj.optString("trx_id", null),
                        orderStatus = obj.optString("order_status", "Pending"),
                        trackingCode = obj.optString("tracking_code"),
                        notes = obj.optString("notes"),
                        createdAt = obj.optString("created_at"),
                        items = itemsList
                    )
                )
            }
            list
        }
    }

    override suspend fun getOrderById(id: Long): Result<Order> {
        return getOrders().map { list -> list.first { it.id == id } }
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
                        name = obj.optString("name"),
                        sku = obj.optString("sku"),
                        stockQuantity = obj.optInt("stock_quantity"),
                        regularPrice = obj.optDouble("regular_price"),
                        salePrice = if (obj.has("sale_price") && !obj.isNull("sale_price")) obj.optDouble("sale_price") else null,
                        categoryName = obj.optString("category_name", "Collection"),
                        stockStatus = obj.optString("stock_status", "In Stock")
                    )
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
        return api.post("inventory", body).map { }
    }

    override suspend fun setStock(productId: Long, exactQuantity: Int): Result<Unit> {
        val body = JSONObject().apply {
            put("product_id", productId)
            put("stock_quantity", exactQuantity)
        }
        return api.post("inventory", body).map { }
    }
}

class DashboardRepositoryImpl(private val api: ApiClient) : DashboardRepository {
    override suspend fun getDashboardOverview(): Result<DashboardOverview> {
        return api.get("reports").map { json ->
            val data = json.getJSONObject("data")
            val ov = data.getJSONObject("overview")
            DashboardOverview(
                grossRevenue = ov.optDouble("gross_revenue"),
                totalOrders = ov.optInt("total_orders"),
                averageOrderValue = ov.optDouble("average_order_value"),
                totalDiscounts = ov.optDouble("total_discounts"),
                totalCustomers = ov.optInt("total_customers"),
                lowStockAlerts = ov.optInt("low_stock_alerts"),
                recentOrders = emptyList()
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
                        name = obj.optString("name"),
                        slug = obj.optString("slug"),
                        description = obj.optString("description"),
                        imageUrl = obj.optString("image"),
                        productCount = obj.optInt("product_count", 0)
                    )
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
                        name = obj.optString("name"),
                        email = obj.optString("email"),
                        phone = obj.optString("phone"),
                        address = obj.optString("address"),
                        area = obj.optString("area", "Dhanmondi"),
                        city = obj.optString("city", "Dhaka"),
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
                        code = obj.optString("code"),
                        type = obj.optString("type"),
                        value = obj.optDouble("value"),
                        minOrder = obj.optDouble("min_order"),
                        maxDiscount = if (obj.has("max_discount")) obj.optDouble("max_discount") else null,
                        expiryDate = obj.optString("expiry_date", "2028-12-31"),
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
                storeName = data.optString("store_name", "Wonderful Collection"),
                storePhone = data.optString("store_phone", "+880 1712-345678"),
                storeEmail = data.optString("store_email", "contact@wonderfulcollection.store"),
                storeAddress = data.optString("store_address", "House 42, Road 7/A, Dhanmondi, Dhaka"),
                deliveryFeeDhanmondi = data.optDouble("delivery_fee_dhanmondi", 60.0),
                deliveryFeeDhaka = data.optDouble("delivery_fee_dhaka", 80.0),
                deliveryFeeOutsideDhaka = data.optDouble("delivery_fee_outside_dhaka", 130.0),
                bkashNumber = data.optString("bkash_number", "01712-345678"),
                nagadNumber = data.optString("nagad_number", "01812-345678")
            )
        }
    }

    override suspend fun updateSettings(settings: Map<String, String>): Result<Unit> {
        val body = JSONObject()
        settings.forEach { (k, v) -> body.put(k, v) }
        return api.post("settings", body).map { }
    }
}

