package store.wonderfulcollection.admin.domain.usecase

import store.wonderfulcollection.admin.domain.model.*
import store.wonderfulcollection.admin.domain.repository.*

/**
 * SOLID - Single Responsibility Principle:
 * Each UseCase encapsulates one single piece of business logic.
 */

class GetDashboardOverviewUseCase(
    private val dashboardRepository: DashboardRepository
) {
    suspend operator fun invoke(): Result<DashboardOverview> {
        return dashboardRepository.getDashboardOverview()
    }
}

class GetProductsUseCase(
    private val productRepository: ProductRepository
) {
    suspend operator fun invoke(category: String? = null, query: String? = null): Result<List<Product>> {
        return productRepository.getProducts(category, query)
    }
}

class CreateProductUseCase(
    private val productRepository: ProductRepository
) {
    suspend operator fun invoke(
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
    ): Result<Long> {
        if (name.isBlank()) return Result.failure(IllegalArgumentException("Product name cannot be empty"))
        if (regularPrice <= 0) return Result.failure(IllegalArgumentException("Regular price must be greater than zero"))
        if (salePrice != null && (salePrice <= 0 || salePrice >= regularPrice)) {
            return Result.failure(IllegalArgumentException("Sale price must be greater than zero and less than regular price"))
        }
        if (categoryId <= 0) return Result.failure(IllegalArgumentException("Choose a product category"))
        if (stock < 0) return Result.failure(IllegalArgumentException("Stock cannot be negative"))
        return productRepository.createProduct(
            name, shortDescription, description, regularPrice, salePrice, categoryId, stock, sku,
            isFeatured, isTrending, imageFiles
        )
    }
}

class GetOrdersUseCase(
    private val orderRepository: OrderRepository
) {
    suspend operator fun invoke(status: String? = null, query: String? = null): Result<List<Order>> {
        return orderRepository.getOrders(status, query)
    }
}

class UpdateOrderStatusUseCase(
    private val orderRepository: OrderRepository
) {
    suspend operator fun invoke(orderId: Long, newStatus: String): Result<Unit> {
        val validStatuses = listOf("Pending", "Processing", "Shipped", "Delivered", "Cancelled")
        if (newStatus !in validStatuses) {
            return Result.failure(IllegalArgumentException("Invalid order status"))
        }
        return orderRepository.updateOrderStatus(orderId, newStatus)
    }
}

class GetInventoryUseCase(
    private val inventoryRepository: InventoryRepository
) {
    suspend operator fun invoke(): Result<List<InventoryItem>> {
        return inventoryRepository.getInventory()
    }
}

class AdjustStockUseCase(
    private val inventoryRepository: InventoryRepository
) {
    suspend operator fun invoke(productId: Long, delta: Int): Result<Unit> {
        return inventoryRepository.adjustStock(productId, delta)
    }
}

class GetCategoriesUseCase(
    private val categoryRepository: CategoryRepository
) {
    suspend operator fun invoke(): Result<List<Category>> {
        return categoryRepository.getCategories()
    }
}

class GetCustomersUseCase(
    private val customerRepository: CustomerRepository
) {
    suspend operator fun invoke(): Result<List<Customer>> {
        return customerRepository.getCustomers()
    }
}

class GetSettingsUseCase(
    private val settingsRepository: SettingsRepository
) {
    suspend operator fun invoke(): Result<StoreSettings> {
        return settingsRepository.getSettings()
    }
}
