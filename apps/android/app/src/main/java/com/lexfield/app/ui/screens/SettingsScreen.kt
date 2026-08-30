package com.lexfield.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lexfield.app.data.Settings
import com.lexfield.app.net.SyncApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(settings: Settings, onUpdate: (Settings) -> Unit, scope: CoroutineScope) {
    val context = LocalContext.current
    var s by remember(settings) { mutableStateOf(settings) }
    var syncUrl by remember { mutableStateOf(settings.syncUrl) }
    var syncUser by remember { mutableStateOf(settings.syncUser) }
    var syncPass by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("参数校准", style = MaterialTheme.typography.headlineSmall)

        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("FSRS 调度", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("目标记忆率:${(s.baseRetention * 100).toInt()}%")
                Slider(
                    value = s.baseRetention.toFloat(),
                    onValueChange = { s = s.copy(baseRetention = it.toDouble()) },
                    valueRange = 0.80f..0.97f,
                )
                Text("分级记忆率偏移:±${(s.tierRetentionDelta * 100).toInt()}%(困难 +Δ,简单 −Δ)")
                Slider(
                    value = s.tierRetentionDelta.toFloat(),
                    onValueChange = { s = s.copy(tierRetentionDelta = it.toDouble()) },
                    valueRange = 0f..0.1f,
                )
                Text("每日新词上限:${s.dailyNew}")
                Slider(
                    value = s.dailyNew.toFloat(),
                    onValueChange = { s = s.copy(dailyNew = it.toInt()) },
                    valueRange = 0f..60f,
                )
                Text("混合模式新词占比:${(s.mixRatio * 100).toInt()}%")
                Slider(
                    value = s.mixRatio.toFloat(),
                    onValueChange = { s = s.copy(mixRatio = it.toDouble()) },
                    valueRange = 0f..1f,
                )
            }
        }

        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("学习范围", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = s.levelFilter == 3,
                        onClick = { s = s.copy(levelFilter = 3) },
                        label = { Text("四级 + 六级") },
                    )
                    FilterChip(
                        selected = s.levelFilter == 1,
                        onClick = { s = s.copy(levelFilter = 1) },
                        label = { Text("仅四级") },
                    )
                    FilterChip(
                        selected = s.levelFilter == 2,
                        onClick = { s = s.copy(levelFilter = 2) },
                        label = { Text("仅六级") },
                    )
                }
            }
        }

        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("云同步(可选)", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = syncUrl,
                    onValueChange = { syncUrl = it },
                    label = { Text("服务器地址") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = syncUser,
                    onValueChange = { syncUser = it },
                    label = { Text("用户名") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = syncPass,
                    onValueChange = { syncPass = it },
                    label = { Text("密码") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        scope.launch {
                            message = try {
                                val res = SyncApi.register(syncUrl, syncUser, syncPass)
                                onUpdate(s.copy(syncUrl = syncUrl, syncUser = syncUser, syncToken = res.token))
                                "注册并登录成功"
                            } catch (e: Exception) {
                                "注册失败:${e.message}"
                            }
                        }
                    }) { Text("注册") }
                    OutlinedButton(onClick = {
                        scope.launch {
                            message = try {
                                val res = SyncApi.login(syncUrl, syncUser, syncPass)
                                onUpdate(s.copy(syncUrl = syncUrl, syncUser = syncUser, syncToken = res.token))
                                "登录成功"
                            } catch (e: Exception) {
                                "登录失败:${e.message}"
                            }
                        }
                    }) { Text("登录") }
                    Button(onClick = {
                        scope.launch {
                            message = try {
                                val res = SyncApi.sync(
                                    syncUrl,
                                    settings.syncToken,
                                    emptyList(),
                                    emptyList(),
                                    null,
                                ) { 0 }
                                "同步完成:拉取 ${res.pulled}"
                            } catch (e: Exception) {
                                "同步失败:${e.message}"
                            }
                        }
                    }) { Text("立即同步") }
                }
                if (message.isNotEmpty()) {
                    Text(message, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                }
            }
        }

        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("桌面小组件", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("展示需要重点记忆的词:困难分级或曾答错(lapses ≥ 1)的单词", fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = s.widgetMode == "hourly",
                        onClick = { s = s.copy(widgetMode = "hourly") },
                        label = { Text("每小时一换") },
                    )
                    FilterChip(
                        selected = s.widgetMode == "daily",
                        onClick = { s = s.copy(widgetMode = "daily") },
                        label = { Text("每天一换") },
                    )
                }
            }
        }

        Button(
            onClick = {
                val modeChanged = s.widgetMode != settings.widgetMode
                onUpdate(s)
                if (modeChanged) {
                    scope.launch { com.lexfield.app.widget.WordWidget().updateAll(context) }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("保存设置") }
    }
}
