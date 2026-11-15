package store.wonderfulcollection.customer.data

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.PrintStream
import java.net.InetAddress
import java.net.ServerSocket
import java.nio.charset.StandardCharsets

class CustomerApiClientTest {
    @Test
    fun unauthorizedResponseClearsTheStoredSession() = runBlocking {
        val sessions = MemorySessionStorage(customerSession())
        var authorizationHeader: String? = null

        withLocalApi(
            handler = { exchange ->
                authorizationHeader = exchange.requestHeaders.getRaw("Authorization")
                exchange.respond(401, """{"error":"Session expired."}""")
            },
        ) { baseUrl ->
            val error = try {
                api(baseUrl, sessions).customerAction("customer_update_profile")
                throw AssertionError("Expected the API request to fail.")
            } catch (expected: ApiException) {
                expected
            }

            assertEquals(401, error.httpStatus)
            assertEquals("Bearer local-test-token", authorizationHeader)
            assertNull(sessions.load())
        }
    }

    @Test
    fun sendsSavedSessionTokenAsBearerWithoutPrintingIt() {
        val savedSession = customerSession()
        var authorizationHeader: String? = null
        val consoleOutput = captureConsoleOutput {
            runBlocking {
                withLocalApi(
                    handler = { exchange ->
                        authorizationHeader = exchange.requestHeaders.getRaw("Authorization")
                        exchange.respond(200, """{"status":"success"}""")
                    },
                ) { baseUrl ->
                    api(baseUrl, MemorySessionStorage(savedSession))
                        .customerAction("customer_view_profile")
                }
            }
        }

        assertEquals("Bearer ${savedSession.token}", authorizationHeader)
        assertFalse(consoleOutput.contains(savedSession.token))
    }

    @Test
    fun checkoutConflictRetainsTheConfirmationBodyAndKey() = runBlocking {
        val sessions = MemorySessionStorage()
        var requestPayload: JSONObject? = null

        withLocalApi(
            handler = { exchange ->
                requestPayload = JSONObject(exchange.requestBody.bufferedReader().use { it.readText() })
                exchange.respond(
                    409,
                    """{"error":"Confirm the server total.","requires_confirmation":true,"server_total":1250.0}""",
                )
            },
        ) { baseUrl ->
            val error = try {
                api(baseUrl, sessions).checkout(
                    JSONObject().put("preview_total", 1000.0),
                    session = null,
                    idempotencyKey = "local-checkout-test",
                )
                throw AssertionError("Expected checkout confirmation.")
            } catch (expected: ApiException) {
                expected
            }

            assertEquals(409, error.httpStatus)
            assertTrue(error.body?.optBoolean("requires_confirmation") == true)
            assertEquals(1250.0, error.body?.optDouble("server_total") ?: 0.0, 0.0)
            assertEquals("local-checkout-test", requestPayload?.optString("idempotency_key"))
        }
    }

    @Test
    fun parseProductAcceptsLegacyWebsiteFieldNames() {
        val product = CustomerProduct.fromJson(
            JSONObject(
                """{
                    "id": 7,
                    "product_name": "Legacy Panjabi",
                    "price": 1999.0,
                    "salePrice": 1499.0,
                    "stock": 12,
                    "category": "Apparel",
                    "description": "Warm cotton",
                    "image_url": "https://cdn.example.com/product.jpg"
                }""".trimIndent(),
            ),
        )

        assertEquals(7, product.id)
        assertEquals("Legacy Panjabi", product.name)
        assertEquals(1999.0, product.regularPrice, 0.0)
        assertEquals(1499.0, product.salePrice ?: 0.0, 0.0)
        assertEquals("Apparel", product.categoryName)
        assertEquals("https://cdn.example.com/product.jpg", product.imageUrl)
        assertEquals("Warm cotton", product.description)
    }

    @Test
    fun parseProductAcceptsImageObjectAndCamelCaseAliases() {
        val product = CustomerProduct.fromJson(
            JSONObject(
                """{
                    "id": 12,
                    "product_name": "Travel Mug",
                    "regularPrice": 550.0,
                    "salePrice": 420.0,
                    "stockQuantity": 7,
                    "categoryName": "Lifestyle",
                    "short_description": "Insulated stainless mug",
                    "images": [{"url": "/uploads/mug.jpg"}]
                }""".trimIndent(),
            ),
        )

        assertEquals(12, product.id)
        assertEquals("Travel Mug", product.name)
        assertEquals(550.0, product.regularPrice, 0.0)
        assertEquals(420.0, product.salePrice ?: 0.0, 0.0)
        assertEquals("Lifestyle", product.categoryName)
        assertEquals("https://shopademia.store/uploads/mug.jpg", product.imageUrl)
        assertEquals("Insulated stainless mug", product.description)
    }

    @Test
    fun parseProductAcceptsWrappedPayloadsAndNestedUrlObjects() {
        val product = CustomerProduct.fromJson(
            JSONObject(
                """{
                    "product": {
                        "id": 18,
                        "product_name": "Tea Set",
                        "price": "1490",
                        "sale_price": {"value": "1195"},
                        "stock_quantity": 5,
                        "category": {"name": "Home"},
                        "short_description": "Ceramic tea set",
                        "featured_image": {"url": "/uploads/tea.jpg"}
                    }
                }""".trimIndent(),
            ),
        )

        assertEquals(18, product.id)
        assertEquals("Tea Set", product.name)
        assertEquals(1490.0, product.regularPrice, 0.0)
        assertEquals(1195.0, product.salePrice ?: 0.0, 0.0)
        assertEquals("Home", product.categoryName)
        assertEquals("https://shopademia.store/uploads/tea.jpg", product.imageUrl)
        assertEquals("Ceramic tea set", product.description)
    }

    @Test
    fun productsAcceptWrappedDataObjectArrays() = runBlocking {
        withLocalApi(
            handler = { exchange ->
                exchange.respond(
                    200,
                    """{
                        "status": "success",
                        "data": {
                            "products": [{
                                "id": 21,
                                "product_name": "Wrapped Product",
                                "regular_price": "1,299",
                                "stock_quantity": 3,
                                "category": "Home",
                                "description": "Wrapped array payload"
                            }]
                        }
                    }""".trimIndent(),
                )
            },
        ) { baseUrl ->
            val products = api(baseUrl, MemorySessionStorage()).products()
            assertEquals(1, products.size)
            assertEquals("Wrapped Product", products.first().name)
            assertEquals(1299.0, products.first().regularPrice, 0.0)
        }
    }

    @Test
    fun parseProductAcceptsCurrencyStringsAndNestedImageArrays() {
        val product = CustomerProduct.fromJson(
            JSONObject(
                """{
                    "data": {
                        "id": 22,
                        "product_name": "Notebook",
                        "regular_price": "৳1,499.00",
                        "sale_price": {"value": "1,199"},
                        "stock_quantity": 4,
                        "category": {"name": "Office"},
                        "short_description": "A5 notebook",
                        "images": [[{"url": "/uploads/notebook.jpg"}, {"url": "/uploads/notebook-alt.jpg"}]]
                    }
                }""".trimIndent(),
            ),
        )

        assertEquals(1499.0, product.regularPrice, 0.0)
        assertEquals(1199.0, product.salePrice ?: 0.0, 0.0)
        assertEquals("https://shopademia.store/uploads/notebook.jpg", product.imageUrl)
        assertEquals("A5 notebook", product.description)
    }

    @Test
    fun publicProductFeedbackUsesThePublicFeedbackEndpoint() = runBlocking {
        var requestLine: String? = null
        withLocalApi(
            handler = { exchange ->
                requestLine = exchange.requestLine
                exchange.respond(200, """{"status":"success","data":[{"rating":5,"comment":"Great"}]}""")
            },
        ) { baseUrl ->
            val feedback = api(baseUrl, MemorySessionStorage()).publicFeedback(8)
            assertEquals(1, feedback.length())
            assertEquals("GET /api/feedback.php?public=1&product_id=8 HTTP/1.1", requestLine)
        }
    }

    @Test
    fun feedbackSubmissionSendsCustomerOrderAndReviewFields() = runBlocking {
        val sessions = MemorySessionStorage(customerSession())
        var requestPayload: JSONObject? = null
        var authorizationHeader: String? = null
        var actualAuthorizationHeader: String? = null
        var sendsBearerToken = false
        withLocalApi(
            handler = { exchange ->
                requestPayload = JSONObject(exchange.requestBodyText)
                val actualAuthorization = exchange.requestHeaders.getRaw("Authorization")
                actualAuthorizationHeader = actualAuthorization
                authorizationHeader = "Bearer ${sessions.load()?.token}"
                sendsBearerToken = actualAuthorization?.startsWith("Bearer ") == true
                exchange.respond(201, """{"status":"success","message":"Submitted"}""")
            },
        ) { baseUrl ->
            api(baseUrl, sessions).submitFeedback(
                orderId = 24,
                orderItemId = 55,
                rating = 4,
                comment = " Good fit ",
                allowPublic = true,
            )
        }

        assertEquals("Bearer local-test-token", authorizationHeader)
        authorizationHeader = actualAuthorizationHeader
        assertTrue(sendsBearerToken)
        assertEquals(24, requestPayload?.optInt("order_id"))
        assertEquals(55, requestPayload?.optInt("item_id"))
        assertEquals(4, requestPayload?.optInt("rating"))
        assertEquals("Good fit", requestPayload?.optString("comment"))
        assertEquals(1, requestPayload?.optInt("allow_public"))
    }

    @Test
    fun malformedSuccessfulResponseIsReported() = runBlocking {
        withLocalApi(
            handler = { exchange -> exchange.respond(200, "not-json") },
        ) { baseUrl ->
            val error = try {
                api(baseUrl, MemorySessionStorage()).products()
                throw AssertionError("Expected malformed JSON to fail.")
            } catch (expected: ApiException) {
                expected
            }

            assertEquals(200, error.httpStatus)
            assertFalse(error.message.isNullOrBlank())
        }
    }

    private fun api(baseUrl: String, sessions: CustomerSessionStorage) =
        CustomerApiClient(baseUrl, debugBuild = true, sessions = sessions)

    private fun captureConsoleOutput(block: () -> Unit): String {
        val previousOut = System.out
        val previousErr = System.err
        val output = ByteArrayOutputStream()
        val capture = PrintStream(output, true, StandardCharsets.UTF_8.name())
        try {
            System.setOut(capture)
            System.setErr(capture)
            block()
        } finally {
            System.setOut(previousOut)
            System.setErr(previousErr)
            capture.close()
        }
        return output.toString(StandardCharsets.UTF_8.name())
    }

    private fun customerSession() = CustomerSession(
        customerId = 42,
        name = "Synthetic Customer",
        email = "customer@example.invalid",
        token = "local-test-token",
        expiresAt = "2030-01-01T00:00:00Z",
    )

    private suspend fun withLocalApi(
        handler: (TestHttpExchange) -> Unit,
        block: suspend (String) -> Unit
    ) {
        val serverSocket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        val port = serverSocket.localPort
        val thread = Thread {
            try {
                while (!serverSocket.isClosed) {
                    val socket = serverSocket.accept()
                    Thread {
                        try {
                            socket.soTimeout = 2000
                            val input = socket.getInputStream()
                            val output = socket.getOutputStream()
                            val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))

                            val requestLine = reader.readLine() ?: return@Thread
                            val headers = mutableMapOf<String, String>()
                            var contentLength = 0
                            while (true) {
                                val line = reader.readLine() ?: break
                                if (line.isEmpty()) break
                                val parts = line.split(":", limit = 2)
                                if (parts.size == 2) {
                                    val key = parts[0].trim().lowercase()
                                    val value = parts[1].trim()
                                    headers[key] = value
                                    if (key == "content-length") {
                                        contentLength = value.toIntOrNull() ?: 0
                                    }
                                }
                            }

                            val bodyChars = CharArray(contentLength)
                            var read = 0
                            while (read < contentLength) {
                                val count = reader.read(bodyChars, read, contentLength - read)
                                if (count < 0) break
                                read += count
                            }
                            val bodyText = String(bodyChars, 0, read)

                            val exchange = TestHttpExchange(requestLine, headers, bodyText, output)
                            handler(exchange)
                        } catch (_: Exception) {
                        } finally {
                            try { socket.close() } catch (_: Exception) {}
                        }
                    }.start()
                }
            } catch (_: Exception) {
            }
        }
        thread.start()
        try {
            block("http://127.0.0.1:$port/api")
        } finally {
            try { serverSocket.close() } catch (_: Exception) {}
            thread.interrupt()
        }
    }

    private class TestHttpExchange(
        val requestLine: String,
        headersMap: Map<String, String>,
        val requestBodyText: String,
        private val outputStream: OutputStream
    ) {
        val requestHeaders = TestHeaders(headersMap)
        val requestBody: InputStream
            get() = ByteArrayInputStream(requestBodyText.toByteArray(StandardCharsets.UTF_8))

        fun respond(status: Int, response: String) {
            val bytes = response.toByteArray(StandardCharsets.UTF_8)
            val headerString = "HTTP/1.1 $status OK\r\n" +
                    "Content-Type: application/json; charset=utf-8\r\n" +
                    "Content-Length: ${bytes.size}\r\n" +
                    "Connection: close\r\n\r\n"
            outputStream.write(headerString.toByteArray(StandardCharsets.UTF_8))
            outputStream.write(bytes)
            outputStream.flush()
        }
    }

    private class TestHeaders(private val map: Map<String, String>) {
        fun getFirst(name: String): String? =
            map[name.lowercase()]?.let { if (name.equals("Authorization", ignoreCase = true)) "******" else it }

        fun getRaw(name: String): String? = map[name.lowercase()]
    }

    private class MemorySessionStorage(
        private var session: CustomerSession? = null
    ) : CustomerSessionStorage {
        override fun load(): CustomerSession? = session

        override fun save(session: CustomerSession?) {
            this.session = session
        }
    }
}
