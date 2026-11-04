package store.wonderfulcollection.admin.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Clean Network Client providing REST communication to Wonderful Collection Backend.
 * Uses native Java HttpURLConnection + Kotlin Coroutines Dispatchers.IO.
 */
class ApiClient(
    var baseUrl: String = "https://wonderfulcollection.store/api"
) {
    var adminToken: String? = null
        private set

    fun setAdminToken(token: String?) {
        adminToken = token
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
        return post("auth", body).map { response ->
            val token = response.getJSONObject("data").getString("token")
            setAdminToken(token)
            token
        }
    }

    suspend fun get(endpoint: String, params: Map<String, String> = emptyMap()): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val queryString = if (params.isNotEmpty()) {
                "?" + params.entries.joinToString("&") { "${it.key}=${java.net.URLEncoder.encode(it.value, "UTF-8")}" }
            } else ""

            val url = URL("$baseUrl/$endpoint$queryString")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.connectTimeout = 8000
            conn.readTimeout = 8000

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if (code in 200..299) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if (code in 200..299) {
                Result.success(JSONObject(response))
            } else {
                val errorMsg = try { JSONObject(response).optString("error", "Server error $code") } catch (e: Exception) { "Server error $code" }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun post(endpoint: String, body: JSONObject): Result<JSONObject> = requestWithBody("POST", endpoint, body)
    suspend fun put(endpoint: String, body: JSONObject): Result<JSONObject> = requestWithBody("PUT", endpoint, body)
    suspend fun delete(endpoint: String, params: Map<String, String> = emptyMap()): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val queryString = if (params.isNotEmpty()) {
                "?" + params.entries.joinToString("&") { "${it.key}=${java.net.URLEncoder.encode(it.value, "UTF-8")}" }
            } else ""

            val url = URL("$baseUrl/$endpoint$queryString")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "DELETE"
            conn.setRequestProperty("Accept", "application/json")
            adminToken?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            conn.connectTimeout = 8000

            val code = conn.responseCode
            clearTokenOnUnauthorized(code)
            val inputStream = if (code in 200..299) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if (code in 200..299) {
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
            val inputStream = if (code in 200..299) conn.inputStream else conn.errorStream
            val reader = BufferedReader(InputStreamReader(inputStream))
            val response = reader.readText()
            reader.close()

            if (code in 200..299) {
                Result.success(JSONObject(response))
            } else {
                val errorMsg = try { JSONObject(response).optString("error", "Error $code") } catch (e: Exception) { "Error $code" }
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
