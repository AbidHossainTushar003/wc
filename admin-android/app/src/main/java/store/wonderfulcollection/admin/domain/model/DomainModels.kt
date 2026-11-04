package store.wonderfulcollection.admin.domain.model

data class Product(
    val id: Long,
    val name: String,
    val slug: String,
    val categoryId: Long,
    val categoryName: String,
    val regularPrice: Double,
    val salePrice: Double?,
    val stockQuantity: Int,
    val sku: String,
    val shortDesc: String,
    val imageUrl: String,
    val isFeatured: Boolean,
    val isTrending: Boolean
)

data class ProductImageFile(
    val mimeType: String,
    val bytes: ByteArray
)

data class Order(
    val id: Long,
    val orderNumber: String,
    val customerName: String,
    val customerPhone: String,
    val customerEmail: String,
    val deliveryAddress: String,
    val deliveryArea: String,
    val deliveryFee: Double,
    val subtotal: Double,
    val discount: Double,
    val total: Double,
    val paymentMethod: String,
    val paymentStatus: String,
    val trxId: String?,
    val orderStatus: String,
    val trackingCode: String,
    val notes: String?,
    val createdAt: String,
    val items: List<OrderItem>
)

data class OrderItem(
    val productId: Long,
    val productName: String,
    val price: Double,
    val quantity: Int,
    val total: Double
)

data class Category(
    val id: Long,
    val name: String,
    val slug: String,
    val description: String,
    val imageUrl: String,
    val productCount: Int
)

data class Customer(
    val id: Long,
    val name: String,
    val email: String,
    val phone: String,
    val address: String,
    val area: String,
    val city: String,
    val totalOrders: Int,
    val totalSpent: Double
)

data class Coupon(
    val id: Long,
    val code: String,
    val type: String,
    val value: Double,
    val minOrder: Double,
    val maxDiscount: Double?,
    val expiryDate: String,
    val timesUsed: Int,
    val isActive: Boolean
)

data class InventoryItem(
    val id: Long,
    val name: String,
    val sku: String,
    val stockQuantity: Int,
    val regularPrice: Double,
    val salePrice: Double?,
    val categoryName: String,
    val stockStatus: String
)

data class DashboardOverview(
    val grossRevenue: Double,
    val totalOrders: Int,
    val averageOrderValue: Double,
    val totalDiscounts: Double,
    val totalCustomers: Int,
    val lowStockAlerts: Int,
    val recentOrders: List<Order>
)

data class StoreSettings(
    val storeName: String,
    val storePhone: String,
    val storeEmail: String,
    val storeAddress: String,
    val deliveryFeeDhanmondi: Double,
    val deliveryFeeDhaka: Double,
    val deliveryFeeOutsideDhaka: Double,
    val bkashNumber: String,
    val nagadNumber: String
)
