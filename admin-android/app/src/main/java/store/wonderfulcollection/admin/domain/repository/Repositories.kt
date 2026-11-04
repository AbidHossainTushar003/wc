package store.wonderfulcollection.admin.domain.repository

import store.wonderfulcollection.admin.domain.model.*

/**
 * SOLID - Interface Segregation: Focused domain contracts.
 * SOLID - Dependency Inversion: High-level modules depend on these abstractions.
 */

interface ProductRepository {
    suspend fun getProducts(category: String? = null, query: String? = null): Result<List<Product>>
    suspend fun getProductById(id: Long): Result<Product>
    suspend fun createProduct(
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
        imageFiles: List<ProductImageFile>
    ): Result<Long>
    suspend fun updateProduct(
        id: Long,
        name: String,
        shortDescription: String,
        regularPrice: Double,
        salePrice: Double?,
        stock: Int
    ): Result<Unit>
    suspend fun deleteProduct(id: Long): Result<Unit>
}

interface OrderRepository {
    suspend fun getOrders(status: String? = null, query: String? = null): Result<List<Order>>
    suspend fun getOrderById(id: Long): Result<Order>
    suspend fun updateOrderStatus(id: Long, status: String): Result<Unit>
}

interface InventoryRepository {
    suspend fun getInventory(): Result<List<InventoryItem>>
    suspend fun adjustStock(productId: Long, delta: Int): Result<Unit>
    suspend fun setStock(productId: Long, exactQuantity: Int): Result<Unit>
}

interface DashboardRepository {
    suspend fun getDashboardOverview(): Result<DashboardOverview>
}

interface CategoryRepository {
    suspend fun getCategories(): Result<List<Category>>
    suspend fun createCategory(name: String, slug: String): Result<Long>
}

interface CustomerRepository {
    suspend fun getCustomers(): Result<List<Customer>>
}

interface CouponRepository {
    suspend fun getCoupons(): Result<List<Coupon>>
    suspend fun createCoupon(code: String, type: String, value: Double, minOrder: Double): Result<Long>
}

interface SettingsRepository {
    suspend fun getSettings(): Result<StoreSettings>
    suspend fun updateSettings(settings: Map<String, String>): Result<Unit>
}
