package store.wonderfulcollection.admin.data.repository

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductCompatibilityTest {
    @Test
    fun parseProductAcceptsLegacyPublicApiFieldNames() {
        val product = parseProduct(
            JSONObject(
                """{
                    "id": 8,
                    "name": "Legacy Shirt",
                    "price": 1500.0,
                    "sale_price": 1200.0,
                    "stock": 9,
                    "category": "Fashion",
                    "short_description": "Cotton shirt",
                    "description": "A lightweight cotton shirt.",
                    "images": ["/uploads/legacy.jpg"]
                }""".trimIndent(),
            ),
        )

        assertEquals(8L, product.id)
        assertEquals("Legacy Shirt", product.name)
        assertEquals(1500.0, product.regularPrice, 0.0)
        assertEquals(1200.0, product.salePrice ?: 0.0, 0.0)
        assertEquals("Fashion", product.categoryName)
        assertEquals("/uploads/legacy.jpg", product.images.first())
        assertTrue(product.shortDesc.contains("Cotton shirt"))
    }
}
