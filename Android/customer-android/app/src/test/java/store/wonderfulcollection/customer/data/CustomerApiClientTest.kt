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
                authorizationHeader = exchange.requestHeaders.getFirst("Authorization")
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
                        authorizationHeader = exchange.requestHeaders.getFirst("Authorization")
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

                            reader.readLine() ?: return@Thread
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

                            val exchange = TestHttpExchange(headers, bodyText, output)
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
        fun getFirst(name: String): String? = map[name.lowercase()]
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
