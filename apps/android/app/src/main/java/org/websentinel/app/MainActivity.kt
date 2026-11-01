package org.websentinel.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    companion object {
        private const val PREFS_NAME = "websentinel_prefs"
        private const val KEY_DARK_MODE = "dark_mode"
        private const val KEY_API_URL = "api_url"
        private const val DEFAULT_API_URL = "http://10.0.2.2:8080"
        private const val KEY_HISTORY = "history"
    }

    private val historyItems = mutableStateListOf<HistoryItem>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var isDark by mutableStateOf(prefs.getBoolean(KEY_DARK_MODE, false))
        var apiUrl by mutableStateOf(prefs.getString(KEY_API_URL, DEFAULT_API_URL) ?: DEFAULT_API_URL)

        // Load history
        loadHistory(prefs)

        setContent {
            val darkTheme = isDark
            WebSentinelTheme(darkTheme = darkTheme) {
                val navController = rememberNavController()
                NavHost(navController = navController, startDestination = "check") {
                    composable("check") {
                        CheckScreen(
                            apiUrl = apiUrl,
                            historyItems = historyItems,
                            onOpenSettings = { navController.navigate("settings") },
                            onShare = { text -> shareText(text) },
                            onDarkToggle = {
                                isDark = !isDark
                                prefs.edit().putBoolean(KEY_DARK_MODE, isDark).apply()
                            },
                            isDark = darkTheme,
                        )
                    }
                    composable("settings") {
                        SettingsScreen(
                            apiUrl = apiUrl,
                            onApiUrlChange = { newUrl ->
                                apiUrl = newUrl
                                prefs.edit().putString(KEY_API_URL, newUrl).apply()
                            },
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
            }
        }
    }

    private fun loadHistory(prefs: SharedPreferences) {
        val raw = prefs.getString(KEY_HISTORY, "") ?: ""
        if (raw.isNotBlank()) {
            try {
                raw.split("\n").filter { it.isNotBlank() }.forEach { line ->
                    val parts = line.split("|")
                    if (parts.size >= 4) {
                        historyItems.add(
                            HistoryItem(
                                origin = parts[0],
                                verdict = parts[1],
                                score = parts[2].toIntOrNull() ?: 0,
                                timestamp = parts[3].toLongOrNull() ?: System.currentTimeMillis(),
                            )
                        )
                    }
                }
            } catch (_: Exception) { }
        }
    }

    private fun saveHistory(prefs: SharedPreferences) {
        val lines = historyItems.joinToString("\n") { "${it.origin}|${it.verdict}|${it.score}|${it.timestamp}" }
        prefs.edit().putString(KEY_HISTORY, lines).apply()
    }

    private fun addHistory(item: HistoryItem) {
        historyItems.add(0, item)
        if (historyItems.size > 100) historyItems.removeAt(historyItems.lastIndex)
        saveHistory(getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE))
    }

    private fun removeHistory(index: Int) {
        if (index in historyItems.indices) {
            historyItems.removeAt(index)
            saveHistory(getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE))
        }
    }

    private fun shareText(text: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(intent, "Share WebSentinel result"))
    }

    // ------- Composable Screens -------

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun CheckScreen(
        apiUrl: String,
        historyItems: List<HistoryItem>,
        onOpenSettings: () -> Unit,
        onShare: (String) -> Unit,
        onDarkToggle: () -> Unit,
        isDark: Boolean,
    ) {
        val context = LocalContext.current
        var urlInput by remember { mutableStateOf("") }
        var status by remember {
            mutableStateOf("Paste a link. Only the site name is sent to the checker.")
        }
        var result by remember { mutableStateOf<Advice?>(null) }
        var isChecking by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()
        val client = remember { CheckClient(apiUrl) }
        val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("WebSentinel", fontWeight = FontWeight.Bold) },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                    actions = {
                        IconButton(onClick = onDarkToggle) {
                            Icon(
                                if (isDark) Icons.Default.LightMode else Icons.Default.DarkMode,
                                contentDescription = "Toggle dark mode",
                            )
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
            ) {
                // Input area
                OutlinedTextField(
                    value = urlInput,
                    onValueChange = { urlInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Link from the message") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                )

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = {
                        scope.launch {
                            isChecking = true
                            result = null
                            status = "Reading the certificate and the registry…"
                            try {
                                val prepared = prepare(urlInput)
                                urlInput = prepared.origin
                                val advice = withContext(Dispatchers.IO) { client.assess(prepared.origin) }
                                result = advice
                                status = if (prepared.discarded) "Everything after the host stayed on this device." else ""
                                addHistory(
                                    HistoryItem(
                                        origin = advice.origin.ifBlank { prepared.origin },
                                        verdict = advice.verdict,
                                        score = advice.advisory,
                                        timestamp = System.currentTimeMillis(),
                                    )
                                )
                            } catch (err: Exception) {
                                status = err.message ?: "The check could not be completed."
                            } finally {
                                isChecking = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    enabled = !isChecking,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    if (isChecking) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (isChecking) "Checking…" else "Check")
                }

                Spacer(Modifier.height(12.dp))

                // Status / result
                Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)

                result?.let { item ->
                    Spacer(Modifier.height(16.dp))

                    // Score card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                item.verdictLabel,
                                color = verdictColor(item.verdict),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 0.5.sp,
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(
                                    "${item.advisory}",
                                    fontSize = 56.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Advisory Score",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(bottom = 10.dp),
                                )
                            }

                            Spacer(Modifier.height(8.dp))
                            Text(
                                item.hostname,
                                fontSize = 18.sp,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.primary,
                            )

                            if (item.summary.isNotBlank()) {
                                Spacer(Modifier.height(8.dp))
                                Text(item.summary, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }

                            if (item.reasons.isNotEmpty()) {
                                Spacer(Modifier.height(8.dp))
                                item.reasons.take(3).forEach { reason ->
                                    Text(
                                        "• $reason",
                                        fontSize = 13.sp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }

                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = { onShare(item.shareText()) },
                                    shape = RoundedCornerShape(8.dp),
                                ) {
                                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Share", fontSize = 12.sp)
                                }
                                OutlinedButton(
                                    onClick = {
                                        val clip = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        clip.setPrimaryClip(ClipData.newPlainText("WebSentinel", item.shareText()))
                                        Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                                    },
                                    shape = RoundedCornerShape(8.dp),
                                ) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Copy", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }

                // History section
                if (historyItems.isNotEmpty()) {
                    Spacer(Modifier.height(24.dp))
                    Text(
                        "History",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(8.dp))

                    historyItems.take(20).forEachIndexed { index, item ->
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        item.origin,
                                        fontSize = 14.sp,
                                        fontFamily = FontFamily.Monospace,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        "${item.verdict}  Score: ${item.score}",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(onClick = { removeHistory(index) }) {
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Delete",
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.size(18.dp),
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))
                Text(
                    "A low score is not proof of safety.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
        }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun SettingsScreen(
        apiUrl: String,
        onApiUrlChange: (String) -> Unit,
        onBack: () -> Unit,
    ) {
        var urlEdit by remember { mutableStateOf(apiUrl) }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Settings") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
            ) {
                Text("API Server URL", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = urlEdit,
                    onValueChange = { urlEdit = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Base URL") },
                    shape = RoundedCornerShape(12.dp),
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { onApiUrlChange(urlEdit) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Save")
                }

                Spacer(Modifier.height(24.dp))
                Text(
                    "WebSentinel Guard v2.0.0",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    @Composable
    fun WebSentinelTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
        val colorScheme = if (darkTheme) {
            darkColorScheme(
                primary = Color(0xFF9FDBC0),
                secondary = Color(0xFFE0A45C),
                error = Color(0xFFE25C64),
                surface = Color(0xFF0A0B10),
                surfaceVariant = Color(0xFF1A1B24),
                onSurface = Color(0xFFE7E1D6),
                onSurfaceVariant = Color(0xFF8D8C86),
                onPrimary = Color(0xFF0A0B10),
                background = Color(0xFF0A0B10),
                onBackground = Color(0xFFE7E1D6),
            )
        } else {
            lightColorScheme(
                primary = Color(0xFF1E6F5C),
                secondary = Color(0xFFB8860B),
                error = Color(0xFFC62828),
                surface = Color(0xFFFFF8F0),
                surfaceVariant = Color(0xFFF0EBE0),
                onSurface = Color(0xFF1D1914),
                onSurfaceVariant = Color(0xFF5E574C),
                onPrimary = Color(0xFFFFFFFF),
                background = Color(0xFFFFF8F0),
                onBackground = Color(0xFF1D1914),
            )
        }
        MaterialTheme(colorScheme = colorScheme, content = content)
    }

    private fun verdictColor(verdict: String): Color = when (verdict) {
        "high_risk" -> Color(0xFFE25C64)
        "suspicious" -> Color(0xFFE0A45C)
        else -> Color(0xFF9FDBC0)
    }

    data class HistoryItem(
        val origin: String,
        val verdict: String,
        val score: Int,
        val timestamp: Long,
    )
}

fun prepare(raw: String): PreparedInput {
    val trimmed = raw.trim()
    if (trimmed.isBlank()) return PreparedInput("", origin = "", discarded = false)
    val hasScheme = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(trimmed)
    val url = try {
        java.net.URL(if (hasScheme) trimmed else "https://$trimmed")
    } catch (_: Exception) {
        return PreparedInput(trimmed, origin = "", discarded = false)
    }
    val origin = "${url.protocol}//${url.host}${if (url.port != -1 && url.port != 80 && url.port != 443) ":${url.port}" else ""}"
    val discarded = url.userInfo != null || url.path.isNotBlank() || url.query != null || url.ref != null
    return PreparedInput(trimmed, origin = origin, discarded = discarded)
}

data class PreparedInput(
    val raw: String,
    val origin: String,
    val discarded: Boolean,
)

fun Advice.shareText(): String = buildString {
    appendLine("WebSentinel result for $origin")
    appendLine("$verdictLabel — Advisory $advisory, Rules $rule")
    if (summary.isNotBlank()) appendLine(summary)
    if (reasons.isNotEmpty()) {
        reasons.take(3).forEach { appendLine("• $it") }
    }
    append("A low score is not proof of safety.")
}