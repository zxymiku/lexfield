package com.lexfield.app.net

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Minimal sync client against the Cloudflare Worker API (same shapes as the TS core). */
object SyncApi {

    data class AuthResult(val token: String, val user: String)

    private fun request(baseUrl: String, path: String, method: String, body: String?, token: String? = null): JSONObject {
        val conn = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 10_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("content-type", "application/json")
        if (token != null) conn.setRequestProperty("authorization", "Bearer $token")
        if (body != null) {
            conn.doOutput = true
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        if (code !in 200..299) {
            val msg = try { JSONObject(text).optString("error") } catch (_: Exception) { text }
            throw RuntimeException("HTTP $code ${msg.take(160)}")
        }
        return JSONObject(text)
    }

    fun register(baseUrl: String, user: String, pass: String): AuthResult {
        val body = JSONObject().put("username", user).put("password", pass)
        val res = request(baseUrl, "/api/auth/register", "POST", body.toString())
        return AuthResult(res.getString("token"), res.getString("user"))
    }

    fun login(baseUrl: String, user: String, pass: String): AuthResult {
        val body = JSONObject().put("username", user).put("password", pass)
        val res = request(baseUrl, "/api/auth/login", "POST", body.toString())
        return AuthResult(res.getString("token"), res.getString("user"))
    }

    /** push cards+logs+settings (credentials stripped by caller), pull newer cards */
    data class SyncResult(val pushed: Int, val pulled: Int)

    fun sync(
        baseUrl: String,
        token: String,
        cardsJson: List<JSONObject>,
        logsJson: List<JSONObject>,
        settingsJson: JSONObject?,
        applyPulled: (List<JSONObject>) -> Int,
    ): SyncResult {
        var pushed = 0
        if (cardsJson.isNotEmpty() || logsJson.isNotEmpty() || settingsJson != null) {
            val body = JSONObject()
                .put("cards", JSONArray(cardsJson))
                .put("logs", JSONArray(logsJson))
                .put("settings", settingsJson ?: JSONObject.NULL)
            val res = request(baseUrl, "/api/sync/push", "POST", body.toString(), token)
            pushed = res.optInt("accepted", 0)
        }
        val pull = request(baseUrl, "/api/sync/pull?since=${System.currentTimeMillis() - 0}", "GET", null, token)
        val pulledCards = pull.optJSONArray("cards") ?: JSONArray()
        val list = (0 until pulledCards.length()).map { pulledCards.getJSONObject(it) }
        val applied = applyPulled(list)
        return SyncResult(pushed, applied)
    }
}
