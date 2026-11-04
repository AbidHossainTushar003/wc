package store.wonderfulcollection.admin.di

import store.wonderfulcollection.admin.data.api.ApiClient
import store.wonderfulcollection.admin.data.repository.*
import store.wonderfulcollection.admin.domain.repository.*
import store.wonderfulcollection.admin.domain.usecase.*

/**
 * SOLID - Dependency Inversion Principle:
 * ServiceLocator manages singletons and supplies dependencies without hardcoded couplings.
 */
object ServiceLocator {

    val apiClient: ApiClient by lazy {
        // By default points to local emulator host or production cPanel domain
        ApiClient(baseUrl = "https://wonderfulcollection.store/api")
    }

    // Repositories
    val productRepository: ProductRepository by lazy { ProductRepositoryImpl(apiClient) }
    val orderRepository: OrderRepository by lazy { OrderRepositoryImpl(apiClient) }
    val inventoryRepository: InventoryRepository by lazy { InventoryRepositoryImpl(apiClient) }
    val dashboardRepository: DashboardRepository by lazy { DashboardRepositoryImpl(apiClient) }
    val categoryRepository: CategoryRepository by lazy { CategoryRepositoryImpl(apiClient) }
    val customerRepository: CustomerRepository by lazy { CustomerRepositoryImpl(apiClient) }
    val couponRepository: CouponRepository by lazy { CouponRepositoryImpl(apiClient) }
    val settingsRepository: SettingsRepository by lazy { SettingsRepositoryImpl(apiClient) }

    // UseCases
    val getDashboardOverviewUseCase: GetDashboardOverviewUseCase by lazy {
        GetDashboardOverviewUseCase(dashboardRepository)
    }

    val getProductsUseCase: GetProductsUseCase by lazy {
        GetProductsUseCase(productRepository)
    }

    val createProductUseCase: CreateProductUseCase by lazy {
        CreateProductUseCase(productRepository)
    }

    val getOrdersUseCase: GetOrdersUseCase by lazy {
        GetOrdersUseCase(orderRepository)
    }

    val updateOrderStatusUseCase: UpdateOrderStatusUseCase by lazy {
        UpdateOrderStatusUseCase(orderRepository)
    }

    val getInventoryUseCase: GetInventoryUseCase by lazy {
        GetInventoryUseCase(inventoryRepository)
    }

    val adjustStockUseCase: AdjustStockUseCase by lazy {
        AdjustStockUseCase(inventoryRepository)
    }

    val getCategoriesUseCase: GetCategoriesUseCase by lazy {
        GetCategoriesUseCase(categoryRepository)
    }

    val getCustomersUseCase: GetCustomersUseCase by lazy {
        GetCustomersUseCase(customerRepository)
    }

    val getSettingsUseCase: GetSettingsUseCase by lazy {
        GetSettingsUseCase(settingsRepository)
    }
}

