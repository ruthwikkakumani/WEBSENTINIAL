package org.websentinel.app

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Result of a WebSentinel assessment.
 */
data class Advice(
    val origin: String,
    val hostname: String,
    val verdict: String,
    val verdictLabel: String,
    val advisory: Int,
    val rule: Int,
    val summary: String,
    val reasons: List<String>,
    val findings: List<Finding> = emptyList(),
    val timestamp: Long = System.currentTimeMillis(),
)

data class Finding(
    val title: String,
    val weight: Int,
    val detail: String,
)

/**
 * Categories of errors the client can produce.
 */
sealed class CheckError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class NetworkError(cause: Throwable) : CheckError("Network error: ${cause.message}", cause)
    class TimeoutError : CheckError("Request timed out")
    class ServerError(code: Int, body: String) : CheckError("Server error $code: ${body.take(200)}")
    class ParseError(cause: Throwable) : CheckError("Failed to parse response", cause)
    class InvalidOrigin(detail: String) : CheckError("Invalid origin: $detail")
    class RateLimited(retryAfter: Int) : CheckError("Rate limited; retry after ${retryAfter}s")
}

/**
 * HTTP client for the WebSentinel assessment API with caching,
 * retry logic with exponential backoff, and configurable timeouts.
 */
class CheckClient(
    private val base: String = "http://10.0.2.2:8080",
    private val connectTimeoutSec: Long = 8,
    private val readTimeoutSec: Long = 40,
    private val writeTimeoutSec: Long = 20,
    private val maxRetries: Int = 3,
    private val cacheTtlMs: Long = 5 * 60 * 1000L,
) {
    private val cache = ConcurrentHashMap<String, CacheEntry>()

    private data class CacheEntry(
        val advice: Advice,
        val cachedAt: Long,
    )

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(connectTimeoutSec, TimeUnit.SECONDS)
            .readTimeout(readTimeoutSec, TimeUnit.SECONDS)
            .writeTimeout(writeTimeoutSec, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * Retrieve a cached result for [origin] if it exists and is fresh.
     */
    fun getCached(origin: String): Advice? {
        val entry = cache[origin] ?: return null
        if (System.currentTimeMillis() - entry.cachedAt > cacheTtlMs) {
            cache.remove(origin)
            return null
        }
        return entry.advice
    }

    /**
     * Invalidate cached result for [origin].
     */
    fun invalidateCache(origin: String) {
        cache.remove(origin)
    }

    /**
     * Clear all cached results.
     */
    fun clearCache() {
        cache.clear()
    }

    /**
     * Perform a synchronous assessment of [origin] against the WebSentinel API.
     * Retries on transient failures with exponential backoff.
     */
    @Throws(CheckError::class)
    fun assess(
        origin: String,
        forceRefresh: Boolean = false,
    ): Advice {
        val clean = origin.trim()
        if (clean.isBlank()) {
            throw CheckError.InvalidOrigin("Origin is blank")
        }
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
            throw CheckError.InvalidOrigin("Must start with http:// or https://")
        }

        if (!forceRefresh) {
            getCached(clean)?.let { return it }
        }

        var lastException: CheckError? = null

        for (attempt in 0..maxRetries) {
            if (attempt > 0) {
                val delayMs = (1L shl (attempt - 1)) * 1000L
                try {
                    Thread.sleep(delayMs)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    throw CheckError.NetworkError(IOException("Interrupted during retry backoff"))
                }
            }

            try {
                val advice = executeAssess(clean)
                cache[clean] = CacheEntry(advice, System.currentTimeMillis())
                return advice
            } catch (e: CheckError.TimeoutError) {
                lastException = e
            } catch (e: CheckError.ServerError) {
                if (e.message?.contains("5") == true) {
                    lastException = e
                } else {
                    throw e
                }
            } catch (e: CheckError.NetworkError) {
                lastException = e
            } catch (e: CheckError) {
                throw e
            }
        }

        throw lastException ?: CheckError.NetworkError(IOException("Max retries exceeded"))
    }

    /**
     * Perform assessment asynchronously via a coroutine-compatible suspend helper.
     */
    suspend fun assessAsync(
        origin: String,
        forceRefresh: Boolean = false,
    ): Advice = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        assess(origin, forceRefresh)
    }

    private fun executeAssess(origin: String): Advice {
        val body = JSONObject().put("url", origin).toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val req = Request.Builder()
            .url("$base/api/v1/assess")
            .post(body)
            .addHeader("User-Agent", "WebSentinel-Android/2.0")
            .addHeader("Accept", "application/json")
            .build()

        val call = http.newCall(req)

        val totalTimeoutMs = readTimeoutSec * 1000L + 5000L
        val watchThread = Thread {
            try {
                Thread.sleep(totalTimeoutMs)
                call.cancel()
            } catch (_: InterruptedException) {
            }
        }
        watchThread.isDaemon = true
        watchThread.start()

        return try {
            call.execute().use { res ->
                watchThread.interrupt()
                val text = res.body?.string().orEmpty()

                if (!res.isSuccessful) {
                    if (res.code == 429) {
                        val retryAfter = res.header("Retry-After")?.toIntOrNull() ?: 30
                        throw CheckError.RateLimited(retryAfter)
                    }
                    throw CheckError.ServerError(res.code, text)
                }

                try {
                    val json = JSONObject(text)
                    parseAdvice(json)
                } catch (e: Exception) {
                    throw CheckError.ParseError(e)
                }
            }
        } catch (e: CheckError) {
            throw e
        } catch (e: IOException) {
            if (e.message?.contains("timeout", ignoreCase = true) == true) {
                throw CheckError.TimeoutError()
            }
            throw CheckError.NetworkError(e)
        } catch (e: Exception) {
            throw CheckError.NetworkError(e)
        }
    }

    private fun parseAdvice(json: JSONObject): Advice {
        val findings = mutableListOf<Finding>()
        val jsonFindings = json.optJSONArray("findings")
        if (jsonFindings != null) {
            for (i in 0 until jsonFindings.length()) {
                val row = jsonFindings.getJSONObject(i)
                findings.add(
                    Finding(
                        title = row.optString("title", ""),
                        weight = row.optInt("weight", 0),
                        detail = row.optString("detail", ""),
                    )
                )
            }
        }

        val reasons = findings
            .filter { it.weight != 0 }
            .map { "${it.weight} ${it.title}" }

        return Advice(
            origin = json.optString("origin"),
            hostname = json.optString("hostname"),
            verdict = json.optString("verdict"),
            verdictLabel = json.optString("verdictLabel"),
            advisory = json.optInt("advisoryScore"),
            rule = json.optInt("ruleScore"),
            summary = json.optString("summary"),
            reasons = reasons,
            findings = findings,
            timestamp = System.currentTimeMillis(),
        )
    }
}