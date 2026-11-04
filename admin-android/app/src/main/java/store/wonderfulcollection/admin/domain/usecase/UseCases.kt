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
    suspend operator fun invoke(name: String, price: Double, categoryId: Long, stock: Int): Result<Long> {
        if (name.isBlank()) return Result.failure(IllegalArgumentException("Product name cannot be empty"))
        if (price <= 0) return Result.failure(IllegalArgumentException("Price must be greater than zero"))
        return productRepository.createProduct(name, price, categoryId, stock)
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

