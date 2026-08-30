package com.lexfield.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.lexfield.app.data.Settings
import com.lexfield.app.data.Store
import com.lexfield.app.data.Vocab
import com.lexfield.app.session.MINUTE
import com.lexfield.app.session.Queue
import com.lexfield.app.session.SessionRunner
import com.lexfield.app.ui.LexFieldTheme
import com.lexfield.app.ui.screens.LibraryScreen
import com.lexfield.app.ui.screens.SessionScreen
import com.lexfield.app.ui.screens.SettingsScreen
import kotlin.math.max
import com.lexfield.app.ui.screens.StatsScreen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

enum class Screen { TODAY, LEARN, REVIEW, MIX, LIBRARY, STATS, SETTINGS }

class MainActivity : ComponentActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // targetSdk 35 enforces edge-to-edge on Android 15+: draw under system
        // bars ourselves and pad content with safeDrawing insets (see AppRoot)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            // dark surfaces -> light (paper) status bar / nav bar icons
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        val vocab = Vocab.load(this)
        val store = Store(this)

        setContent {
            LexFieldTheme {
                AppRoot(vocab, store, scope)
            }
        }
    }
}

@Composable
private fun AppRoot(vocab: Vocab, store: Store, scope: CoroutineScope) {
    var screen by remember { mutableStateOf(Screen.TODAY) }
    var settings by remember { mutableStateOf(loadSettings(store)) }
    var revision by remember { mutableStateOf(0) } // bump to recompute counts

    val counts = remember(screen, revision, settings) {
        computeCounts(store, vocab, settings)
    }
    val runner = remember(store, vocab, settings) {
        SessionRunner(store, vocab, settings)
    }

    Surface(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(
                WindowInsets.safeDrawing.only(
                    WindowInsetsSides.Horizontal + WindowInsetsSides.Vertical,
                ),
            )
            // with edge-to-edge, adjustResize no longer resizes: pad by IME ourselves
            .imePadding()
    ) {
        when (screen) {
            Screen.TODAY -> TodayScreen(counts, settings) { screen = it }
            Screen.LEARN -> SessionScreen("learn", vocab, store, runner, settings, scope, { revision++ }) { screen = Screen.TODAY }
            Screen.REVIEW -> SessionScreen("review", vocab, store, runner, settings, scope, { revision++ }) { screen = Screen.TODAY }
            Screen.MIX -> SessionScreen("mix", vocab, store, runner, settings, scope, { revision++ }) { screen = Screen.TODAY }
            Screen.LIBRARY -> LibraryScreen(vocab, store, runner, scope, onDirty = { revision++ })
            Screen.STATS -> StatsScreen(store, vocab, settings)
            Screen.SETTINGS -> SettingsScreen(settings, onUpdate = {
                settings = it
                store.putMeta("settings", it.toJson())
                revision++
            }, scope)
        }
    }
}

fun loadSettings(store: Store): Settings =
    store.getMeta("settings")?.let { Settings.fromJson(it) } ?: Settings()

data class Counts(
    val due: Int,
    val learning: Int,
    val newRemaining: Int,
    val reviewedToday: Int,
    val totalSeen: Int,
)

fun computeCounts(store: Store, vocab: Vocab, settings: Settings): Counts {
    val now = System.currentTimeMillis()
    val cards = store.allCards()
    var due = 0
    var learning = 0
    val seen = HashSet<String>()
    for (c in cards) {
        if (c.suspended || c.senseIdx != null) continue
        seen.add(c.word)
        if (c.state == com.lexfield.app.fsrs.CardState.REVIEW && c.due <= now) due++
        if ((c.state == com.lexfield.app.fsrs.CardState.LEARNING || c.state == com.lexfield.app.fsrs.CardState.RELEARNING) && c.due <= now) learning++
    }
    val logs = store.allLogs()
    val startOfDay = Queue.startOfDay(now)
    val reviewedToday = logs.count { it.optLong("at") >= startOfDay }
    val introduced = Queue.newIntroducedToday(logs, now)
    val newRemaining = minOf(
        max(0, settings.dailyNew - introduced),
        vocab.all().count { !seen.contains(it.w) && (it.lv and settings.levelFilter) != 0 },
    )
    return Counts(due, learning, newRemaining, reviewedToday, seen.size)
}

@Composable
private fun TodayScreen(counts: Counts, settings: Settings, onNavigate: (Screen) -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .width(14.dp)
                    .height(14.dp)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.width(10.dp))
            Text("LEXFIELD · 今日", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (counts.due + counts.learning > 0) "有到期任务待执行" else "队列为空,可引入新词",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(onClick = {}, label = { Text("到期 ${counts.due + counts.learning}") })
                    AssistChip(onClick = {}, label = { Text("可学 ${counts.newRemaining}") })
                    AssistChip(onClick = {}, label = { Text("已评 ${counts.reviewedToday}") })
                }
                LinearProgressIndicator(
                    progress = {
                        (counts.reviewedToday.toFloat() / max(1, settings.dailyNew * 2)).coerceIn(0f, 1f)
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        ModeCard("01 / LEARN NEW", "学习新词", "${counts.newRemaining} READY", counts.newRemaining > 0) { onNavigate(Screen.LEARN) }
        ModeCard("02 / REVIEW DUE", "复习到期", "${counts.due + counts.learning} DUE", counts.due + counts.learning > 0) { onNavigate(Screen.REVIEW) }
        ModeCard("03 / MIXED OPS", "混合模式", "${counts.due + counts.learning + counts.newRemaining} TOTAL", true, primary = true) { onNavigate(Screen.MIX) }

        Text(
            "词库 ${vocabTotal}词 · 已入列 ${counts.totalSeen}",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val vocabTotal = 8728

@Composable
private fun ModeCard(
    code: String,
    title: String,
    countLabel: String,
    enabled: Boolean,
    primary: Boolean = false,
    onClick: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(code, fontSize = 11.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                countLabel,
                fontSize = 40.sp,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            )
            Button(
                onClick = onClick,
                enabled = enabled,
                colors = if (primary) ButtonDefaults.buttonColors() else ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ),
            ) {
                Text(if (enabled) "开始 START" else "暂无任务")
            }
        }
    }
}
