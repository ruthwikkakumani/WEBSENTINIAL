package org.websentinel.app

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class Advice(
    val origin: String,
    val hostname: String,
    val verdict: String,
    val verdictLabel: String,
    val advisory: Int,
    val rule: Int,
    val summary: String,
    val reasons: List<String>,
)

class CheckClient(
    private val base: String = "http://10.0.2.2:8080",
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)
        .build()

    fun assess(origin: String): Advice {
        val body = JSONObject().put("url", origin).toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val req = Request.Builder().url("$base/api/v1/assess").post(body).build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val json = JSONObject(text)
            if (!res.isSuccessful) {
                throw IllegalStateException(json.optString("error", "The check could not be completed."))
            }
            val findings = json.optJSONArray("findings")
            val reasons = mutableListOf<String>()
            if (findings != null) {
                for (i in 0 until findings.length()) {
                    val row = findings.getJSONObject(i)
                    if (row.optInt("weight") != 0) {
                        reasons.add("${row.optInt("weight")} ${row.optString("title")}")
                    }
                }
            }
            return Advice(
                origin = json.optString("origin"),
                hostname = json.optString("hostname"),
                verdict = json.optString("verdict"),
                verdictLabel = json.optString("verdictLabel"),
                advisory = json.optInt("advisoryScore"),
                rule = json.optInt("ruleScore"),
                summary = json.optString("summary"),
                reasons = reasons,
            )
        }
    }
}
