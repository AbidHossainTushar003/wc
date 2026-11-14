package store.wonderfulcollection.admin.domain.usecase

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import store.wonderfulcollection.admin.domain.model.Order
import store.wonderfulcollection.admin.domain.model.Product
import store.wonderfulcollection.admin.domain.model.ProductImageFile
import store.wonderfulcollection.admin.domain.repository.OrderRepository
import store.wonderfulcollection.admin.domain.repository.ProductRepository

class UseCasesTest {

    @Test
    fun createProductUseCaseRejectsInvalidInput() = runBlocking {
        val mockRepo = object : ProductRepository {
            override suspend fun getProducts(category: String?, query: String?) = Result.success(emptyList<Product>())
            override suspend fun getProductById(id: Long) = Result.failure<Product>(NotImplementedError())
            override suspend fun createProduct(
                name: String, shortDescription: String, description: String,
                regularPrice: Double, salePrice: Double?, categoryId: Long, stock: Int,
                sku: String?, isFeatured: Boolean, isTrending: Boolean, imageFiles: List<ProductImageFile>
            ) = Result.success(101L)
            override suspend fun updateProduct(id: Long, name: String, shortDescription: String, regularPrice: Double, salePrice: Double?, stock: Int, expectedStock: Int) = Result.success(Unit)
            override suspend fun deleteProduct(id: Long) = Result.success(Unit)
        }

        val useCase = CreateProductUseCase(mockRepo)

        // Blank name
        var result = useCase("", "desc", "full desc", 100.0, null, 1L, 10, null, false, false, emptyList())
        assertTrue(result.isFailure)
        assertEquals("Product name cannot be empty", result.exceptionOrNull()?.message)

        // Non-positive regular price
        result = useCase("Panjabi", "desc", "full desc", 0.0, null, 1L, 10, null, false, false, emptyList())
        assertTrue(result.isFailure)
        assertEquals("Regular price must be greater than zero", result.exceptionOrNull()?.message)

        // Invalid sale price >= regular price
        result = useCase("Panjabi", "desc", "full desc", 100.0, 150.0, 1L, 10, null, false, false, emptyList())
        assertTrue(result.isFailure)
        assertEquals("Sale price must be greater than zero and less than regular price", result.exceptionOrNull()?.message)

        // Negative stock
        result = useCase("Panjabi", "desc", "full desc", 100.0, null, 1L, -5, null, false, false, emptyList())
        assertTrue(result.isFailure)
        assertEquals("Stock cannot be negative", result.exceptionOrNull()?.message)
    }

    @Test
    fun updateOrderStatusUseCaseRejectsInvalidStatus() = runBlocking {
        var updatedStatus: String? = null
        val mockRepo = object : OrderRepository {
            override suspend fun getOrders(status: String?, query: String?) = Result.success(emptyList<Order>())
            override suspend fun getOrderById(id: Long) = Result.failure<Order>(NotImplementedError())
            override suspend fun updateOrderStatus(id: Long, status: String): Result<Unit> {
                updatedStatus = status
                return Result.success(Unit)
            }
        }

        val useCase = UpdateOrderStatusUseCase(mockRepo)

        // Invalid status
        var result = useCase(501L, "InvalidStatus")
        assertTrue(result.isFailure)
        assertEquals("Invalid order status", result.exceptionOrNull()?.message)

        // Valid status
        result = useCase(501L, "Shipped")
        assertTrue(result.isSuccess)
        assertEquals("Shipped", updatedStatus)
    }
}
