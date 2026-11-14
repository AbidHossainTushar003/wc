package store.wonderfulcollection.customer.data

import org.json.JSONObject

data class CustomerProduct(
    val id: Int,
    val name: String,
    val regularPrice: Double,
    val salePrice: Double?,
    val stockQuantity: Int,
    val description: String,
    val imageUrl: String? = null,
    val categoryName: String = "General",
    val sku: String = "",
) {
    val currentPrice: Double
        get() = salePrice?.takeIf { it > 0 } ?: regularPrice

    val isOnSale: Boolean
        get() = salePrice != null && salePrice > 0 && salePrice < regularPrice

    val discountPercentage: Int
        get() = if (isOnSale && regularPrice > 0) {
            (((regularPrice - currentPrice) / regularPrice) * 100).toInt()
        } else 0

    companion object {
        private fun JSONObject.optStringAny(vararg keys: String): String {
            for (key in keys) {
                if (has(key) && !isNull(key)) {
                    val value = optString(key)
                    if (value.isNotBlank()) return value
                }
            }
            return ""
        }

        private fun JSONObject.optDoubleAny(vararg keys: String): Double {
            for (key in keys) {
                if (has(key) && !isNull(key)) {
                    val value = optDouble(key, Double.NaN)
                    if (value.isFinite() && value >= 0.0) return value
                }
            }
            return 0.0
        }

        private fun JSONObject.optImageArray(): List<String> {
            val images = optJSONArray("images")
            if (images != null) {
                return (0 until images.length()).mapNotNull { index ->
                    val item = images.optString(index)
                    item.takeIf { it.isNotBlank() }
                }
            }
            val rawValue = optStringAny("image", "image_url", "thumbnail", "thumb", "featured_image")
            return if (rawValue.isBlank()) emptyList() else listOf(rawValue)
        }

        fun fromJson(json: JSONObject): CustomerProduct {
            val name = json.optStringAny("name", "product_name", "title")
            val regularPrice = json.optDoubleAny("regular_price", "price")
            val salePrice = listOf("sale_price", "discount_price", "special_price", "salePrice")
                .firstOrNull { json.has(it) && !json.isNull(it) }
                ?.let { json.optDouble(it, Double.NaN) }
                ?.takeIf { it.isFinite() && it > 0 }
            val stockQuantity = json.optInt("stock_quantity", json.optInt("stock", 0))
            val images = json.optImageArray()
            val firstImage = images.firstOrNull { item ->
                item.isNotBlank() && !item.startsWith("content://") && !item.endsWith(".svg")
            }

            val rawImage = firstImage
                ?: json.optStringAny("image", "image_url", "thumb", "thumbnail", "featured_image")
                .takeIf { it.isNotBlank() }

            val imageUrl = when {
                rawImage.isNullOrBlank() || rawImage.startsWith("content://") || rawImage.endsWith(".svg") -> null
                rawImage.startsWith("http://") || rawImage.startsWith("https://") -> rawImage
                else -> "https://shopademia.store/" + rawImage.removePrefix("/")
            }

            val categoryName = json.optStringAny("category_name", "category", "categoryTitle").ifBlank { "General" }
            val sku = json.optStringAny("sku", "product_sku")

            return CustomerProduct(
                id = json.optInt("id", 0).takeIf { it > 0 } ?: 0,
                name = name,
                regularPrice = regularPrice,
                salePrice = salePrice,
                stockQuantity = stockQuantity,
                description = json.optStringAny("short_desc", "short_description", "description", "excerpt").ifBlank {
                    json.optStringAny("summary")
                },
                imageUrl = imageUrl,
                categoryName = categoryName,
                sku = sku,
            ).also {
                require((it.id > 0) && it.name.isNotBlank() && (it.regularPrice > 0)) {
                    "The server returned an invalid product."
                }
            }
        }
    }
}
