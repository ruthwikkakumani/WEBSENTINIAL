package org.websentinel.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val client = CheckClient()
        setContent {
            val paper = Color(0xFFE7E1D6)
            val ink = Color(0xFF1D1914)
            var value by remember { mutableStateOf("") }
            var status by remember { mutableStateOf("Paste a link. Only the site name is sent to the checker on this computer.") }
            var advice by remember { mutableStateOf<Advice?>(null) }
            val scope = rememberCoroutineScope()
            Column(
                Modifier
                    .fillMaxSize()
                    .background(paper)
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
            ) {
                Text("WebSentinel", color = ink, fontSize = 28.sp, fontFamily = FontFamily.Serif)
                Text("Before you type an OTP", color = Color(0xFF1E3A5F), fontSize = 12.sp)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Link from the message") },
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        scope.launch {
                            status = "Reading the certificate and the registry…"
                            advice = null
                            try {
                                val prepared = prepare(value)
                                value = prepared.origin
                                val result = withContext(Dispatchers.IO) { client.assess(prepared.origin) }
                                advice = result
                                status = if (prepared.discarded) "Anything after the host stayed on this phone." else ""
                            } catch (err: Exception) {
                                status = err.message ?: "The check could not be completed."
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ink),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Check") }
                Spacer(Modifier.height(16.dp))
                Text(status, color = Color(0xFF5E574C))
                advice?.let { item ->
                    Spacer(Modifier.height(16.dp))
                    Text(item.verdictLabel, color = ink, fontSize = 13.sp)
                    Text("${item.advisory}", color = ink, fontSize = 56.sp, fontFamily = FontFamily.Serif)
                    Text(item.hostname, fontSize = 22.sp, fontFamily = FontFamily.Serif)
                    Text(item.summary, color = Color(0xFF5E574C))
                    item.reasons.forEach { Text("• $it") }
                    Text("A low score is not proof of safety.", color = Color(0xFF5E574C), fontSize = 12.sp)
                }
            }
        }
    }
}
