package store.wonderfulcollection.admin.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import android.content.Context
import store.wonderfulcollection.admin.BuildConfig
import store.wonderfulcollection.admin.domain.model.ProductImageFile
import java.io.ByteArrayOutputStream
import java.io.BufferedReader
import java.io.DataOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.URI
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Clean Network Client providing REST communication to Wonderful Collection Backend.
 * Uses native Java HttpURLConnection + Kotlin Coroutines Dispatchers.IO.
 */
class ApiClient(
    baseUrl: String = "https://wonderfulcollection.store/api",
) {
    var baseUrl: String = normalizeApiBaseUrl(baseUrl, BuildConfig.DEBUG)
        private set

    var adminToken: String? = null
        private set

    private var tokenStorage: SecureTokenStorage? = null

    fun updateBaseUrl(value: String) {
        baseUrl = normalizeApiBaseUrl(value, BuildConfig.DEBUG)
    }

    fun attachTokenStorage(context: Context) {
        tokenStorage = SecureTokenStorage(context.applicationContext)
        adminToken = tokenStorage?.getToken()
    }

    fun setAdminToken(token: String?) {
        adminToken = token
        tokenStorage?.saveToken(token)
    }

    private fun clearTokenOnUnauthorized(code: Int) {
        if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
            setAdminToken(null)
        }
    }

    suspend fun loginAdmin(username: String, password: String): Result<String> {
        val body = JSONObject()
            .put("action", "admin_login")
            .put("username", username)
            .put("password", password)
        return post("auth", body).fold(
            onSuccess = { response ->
                val data = response.optJSONObject("data")
                if (data == null) {
                    Result.failure(IllegalStateException("Invalid authentication response from server."))
                } else {
                    handleAdminLoginResponse(
                        data.optBoolean("must_change_password"),
                        data.optString("token")
                    )
                }
            },
            onFailure = { Result.failure(it) }
        )
    }

    internal fun handleAdminLoginResponse(mustChangePassword: Boolean, token: String?): Result<String> {
        if (mustChangePassword) {
            return Result.failure(IllegalStateException("Complete the required password change in the web admin panel before using the Android app."))
        }
        val validToken = token?.takeIf(String::isNotBlank)
            ?: return Result.failure(IllegalStateException("Invalid authentication response from server."))
        setAdminToken(validToken)
        return Result.success(validToken)
    }

    suspend fun get(endpoint: String, params: Map<String, String> = emptyMap()): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val queryString = if (params.isNotEmpty()) {
                "?" + params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
            } else ""

            val url = URL("$baseUrl/$endpoint$queryString")
            val conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if ((code in 200..299)) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if ((code in 200..299)) {
                Result.success(JSONObject(response))
            } else {
                val errorMsg = try { JSONObject(response).optString("error", "Server error $code") } catch (_: Exception) { "Server error $code" }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun post(endpoint: String, body: JSONObject): Result<JSONObject> = requestWithBody("POST", endpoint, body)
    suspend fun put(endpoint: String, body: JSONObject): Result<JSONObject> = requestWithBody("PUT", endpoint, body)

    suspend fun uploadProductImages(images: List<ProductImageFile>): Result<List<String>> = withContext(Dispatchers.IO) {
        try {
            if (images.isEmpty() || images.size > 5) {
                return@withContext Result.failure(IllegalArgumentException("Select between one and five product images."))
            }

            val boundary = "WC-${System.currentTimeMillis()}-${images.size}"
            val payload = ByteArrayOutputStream()
            DataOutputStream(payload).use { output ->
                images.forEachIndexed { index, image ->
                    output.writeBytes("--$boundary\r\n")
                    output.writeBytes("Content-Disposition: form-data; name=\"images[]\"; filename=\"product-${index + 1}.jpg\"\r\n")
                    output.writeBytes("Content-Type: ${image.mimeType}\r\n\r\n")
                    output.write(image.bytes)
                    output.writeBytes("\r\n")
                }
                output.writeBytes("--$boundary--\r\n")
            }

            val conn = URL("$baseUrl/product-images").openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.outputStream.use { it.write(payload.toByteArray()) }

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if (code in 200..299) conn.inputStream else conn.errorStream
            val response = BufferedReader(InputStreamReader(inputStream)).use { it.readText() }
            if (code in 200..299) {
                val json = JSONObject(response)
                val paths = json.getJSONObject("data").getJSONArray("images")
                Result.success(List(paths.length()) { paths.getString(it) })
            } else {
                val errorMsg = try {
                    JSONObject(response).optString("error", "Image upload failed ($code)")
                } catch (_: Exception) {
                    "Image upload failed ($code)"
                }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun delete(endpoint: String, params: Map<String, String> = emptyMap()): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val queryString = if (params.isNotEmpty()) {
                "?" + params.entries.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
            } else ""

            val url = URL("$baseUrl/$endpoint$queryString")
            val conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.requestMethod = "DELETE"
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.connectTimeout = 8000

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if ((code in 200..299)) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if ((code in 200..299)) {
                Result.success(JSONObject(response))
            } else {
                Result.failure(Exception("HTTP $code"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun requestWithBody(method: String, endpoint: String, body: JSONObject): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val url = URL("$baseUrl/$endpoint")
            val conn = url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.requestMethod = method
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val writer = OutputStreamWriter(conn.outputStream)
            writer.write(body.toString())
            writer.flush()
            writer.close()

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if ((code in 200..299)) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if ((code in 200..299)) {
                Result.success(JSONObject(response))
            } else {
                val errorMsg = try { JSONObject(response).optString("error", "Error $code") } catch (_: Exception) { "Error $code" }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    internal fun normalizeApiBaseUrl(value: String, allowDevelopmentEndpoint: Boolean): String {
        val uri = try {
            URI(value.trim())
        } catch (error: Exception) {
            throw IllegalArgumentException("Enter a valid API URL.", error)
        }
        val path = uri.path?.trimEnd('/') ?: ""
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) {
            "API URL must not contain credentials, query parameters, or a fragment."
        }
        require(path == "/api") { "API URL must end in /api." }

        val productionHost = "wonderfulcollection.store".equals(uri.host, ignoreCase = true)
        if (productionHost && uri.scheme.equals("https", ignoreCase = true) && uri.port in listOf(-1, 443)) {
            return "https://wonderfulcollection.store/api"
        }

        val host = uri.host ?: ""
        val isLocalDevHost = host == "10.0.2.2" || host == "localhost" || host == "127.0.0.1" ||
            host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")

        if (allowDevelopmentEndpoint
            && isLocalDevHost
            && uri.scheme.equals("http", ignoreCase = true)
            && uri.port == 3000) {
            return "http://$host:3000/api"
        }

        throw IllegalArgumentException("Only the production HTTPS API or the debug emulator API is allowed.")
    }
}
