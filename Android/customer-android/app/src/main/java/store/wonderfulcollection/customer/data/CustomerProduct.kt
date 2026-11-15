package store.wonderfulcollection.customer.data

import org.json.JSONArray
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
        get() = (salePrice != null && salePrice > 0 && salePrice < regularPrice)

    val discountPercentage: Int
        get() = if (isOnSale && regularPrice > 0) {
            (((regularPrice - currentPrice) / regularPrice) * 100).toInt()
        } else 0

    companion object {
        private fun unwrapPayload(json: JSONObject): JSONObject {
            if (json.has("data") && !json.isNull("data") && json.opt("data") is JSONObject) {
                return json.getJSONObject("data")
            }
            if (json.has("product") && !json.isNull("product") && json.opt("product") is JSONObject) {
                return json.getJSONObject("product")
            }
            return json
        }

        private fun normalizeNumericString(value: String): Double? {
            val cleaned = value.trim()
                .replace(Regex("[\\s_]+"), "")
                .replace(Regex("[^0-9.,-]+"), "")
                .replace(",", "")
                .trim()
            if (cleaned.isEmpty() || cleaned == "-" || cleaned == ".") return null
            return cleaned.toDoubleOrNull()
        }

        private fun JSONObject.optStringAny(vararg keys: String): String {
            val searchKeys = keys.toList() + listOf("value", "name", "title", "label", "url", "image", "image_url")
            for (key in searchKeys) {
                if (!has(key) || isNull(key)) continue
                val value = opt(key)
                when (value) {
                    is String -> if (value.isNotBlank()) return value
                    is Number -> if (value.toString().isNotBlank()) return value.toString()
                    is Boolean -> return value.toString()
                    is JSONObject -> {
                        val nested = value.optStringAny(*searchKeys.toTypedArray())
                        if (nested.isNotBlank()) return nested
                    }
                    is JSONArray -> {
                        for (index in 0 until value.length()) {
                            when (val nested = value.opt(index)) {
                                is JSONObject -> {
                                    val match = nested.optStringAny(*searchKeys.toTypedArray())
                                    if (match.isNotBlank()) return match
                                }
                                is String -> if (nested.isNotBlank()) return nested
                            }
                        }
                    }
                }
            }
            return ""
        }

        private fun JSONObject.optDoubleAny(vararg keys: String): Double {
            val searchKeys = keys.toList() + listOf("value", "amount", "price", "base_price", "regular_price", "regularPrice")
            for (key in searchKeys) {
                if (!has(key) || isNull(key)) continue
                val value = opt(key)
                val numeric = when (value) {
                    is Number -> value.toDouble()
                    is String -> normalizeNumericString(value)
                    is JSONObject -> value.optDoubleAny(*searchKeys.toTypedArray())
                    is JSONArray -> value.toDoubleList().firstOrNull()
                    else -> null
                }
                if (numeric != null && numeric.isFinite() && numeric >= 0.0) return numeric
            }
            return 0.0
        }

        private fun JSONArray.toDoubleList(): List<Double> = buildList {
            for (index in 0 until length()) {
                val item = opt(index)
                val numeric = when (item) {
                    is Number -> item.toDouble()
                    is String -> normalizeNumericString(item)
                    is JSONObject -> item.optDoubleAny("value", "amount", "price")
                    else -> null
                }
                if (numeric != null && numeric.isFinite()) add(numeric)
            }
        }

        private fun JSONObject.optImageArray(): List<String> {
            for (name in listOf("images", "gallery", "media", "product_images")) {
                val candidate = optJSONArray(name) ?: continue
                val extracted = buildList {
                    for (index in 0 until candidate.length()) {
                        val item = candidate.opt(index)
                        val value = when (item) {
                            is String -> item
                            is JSONObject -> item.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb")
                            is JSONArray -> item.toImageStrings().firstOrNull() ?: ""
                            else -> item?.toString() ?: ""
                        }
                        if (value.isNotBlank()) add(value)
                    }
                }
                if (extracted.isNotEmpty()) return extracted
            }

            val fallbackCandidates = listOf("image", "image_url", "thumbnail", "thumb", "featured_image", "featuredImage")
            for (candidate in fallbackCandidates) {
                if (!has(candidate) || isNull(candidate)) continue
                val value = opt(candidate)
                val extracted = when (value) {
                    is String -> if (value.isNotBlank()) listOf(value) else emptyList()
                    is JSONObject -> listOf(value.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb"))
                    is JSONArray -> value.toImageStrings()
                    else -> emptyList()
                }
                if (extracted.isNotEmpty()) return extracted.filter { it.isNotBlank() }
            }
            return emptyList()
        }

        private fun JSONArray.toImageStrings(): List<String> {
            return buildList {
                for (index in 0 until length()) {
                    val item = opt(index)
                    val value = when (item) {
                        is String -> item
                        is JSONObject -> item.optStringAny("url", "src", "image", "image_url", "path", "thumbnail", "thumb")
                        is JSONArray -> item.toImageStrings().firstOrNull() ?: ""
                        else -> item?.toString() ?: ""
                    }
                    if (value.isNotBlank()) add(value)
                }
            }
        }

        fun fromJson(json: JSONObject): CustomerProduct {
            val payload = unwrapPayload(json)
            val name = payload.optStringAny("name", "product_name", "title", "productTitle")
            val regularPrice = payload.optDoubleAny("regular_price", "regularPrice", "price")
            val salePrice = listOf("sale_price", "salePrice", "discount_price", "special_price")
                .firstOrNull { payload.has(it) && !payload.isNull(it) }
                ?.let { payload.opt(it) }
                ?.let { value ->
                    when (value) {
                        is Number -> value.toDouble()
                        is String -> value.toDoubleOrNull()
                        is JSONObject -> value.optDoubleAny("value", "amount", "price")
                        else -> null
                    }
                }
                ?.takeIf { it.isFinite() && it > 0 }
            val stockQuantity = payload.optInt("stock_quantity", payload.optInt("stock", payload.optInt("stockQuantity", 0)))
            val images = payload.optImageArray()
            val firstImage = images.firstOrNull { item ->
                item.isNotBlank() && !item.startsWith("content://") && !item.endsWith(".svg")
            }

            val rawImage = firstImage
                ?: payload.optStringAny("image", "image_url", "thumb", "thumbnail", "featured_image", "featuredImage")
                .takeIf { it.isNotBlank() }

            val imageUrl = when {
                (rawImage.isNullOrBlank() || rawImage.startsWith("content://") || rawImage.endsWith(".svg")) -> null
                (rawImage.startsWith("http://") || rawImage.startsWith("https://")) -> rawImage
                else -> "https://shopademia.store/" + rawImage.removePrefix("/")
            }

            val categoryValue = payload.opt("category")
            val categoryName = when (categoryValue) {
                is JSONObject -> categoryValue.optStringAny("name", "title", "category_name")
                is String -> categoryValue
                else -> payload.optStringAny("category_name", "categoryName", "category", "categoryTitle", "category_title")
            }.ifBlank { "General" }
            val sku = payload.optStringAny("sku", "product_sku")

            return CustomerProduct(
                id = payload.optInt("id", payload.optInt("product_id", 0)).takeIf { it > 0 } ?: 0,
                name = name,
                regularPrice = regularPrice,
                salePrice = salePrice,
                stockQuantity = stockQuantity,
                description = payload.optStringAny("short_desc", "short_description", "shortDesc", "description", "excerpt").ifBlank {
                    payload.optStringAny("summary")
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
