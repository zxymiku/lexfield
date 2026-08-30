package com.lexfield.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lexfield.app.Counts
import com.lexfield.app.data.Card
import com.lexfield.app.data.Settings
import com.lexfield.app.data.Store
import com.lexfield.app.data.Vocab
import com.lexfield.app.fsrs.CardState
import com.lexfield.app.fsrs.Rating
import com.lexfield.app.fsrs.Tier
import com.lexfield.app.session.DAY
import com.lexfield.app.session.Item
import com.lexfield.app.session.MINUTE
import com.lexfield.app.session.Queue
import com.lexfield.app.session.Question
import com.lexfield.app.session.Questions
import com.lexfield.app.session.SessionRunner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/* ==========================================================================
   Session screen - self / single-choice / multi-choice player
   ========================================================================== */

@Composable
fun SessionScreen(
    mode: String,
    vocab: Vocab,
    store: Store,
    runner: SessionRunner,
    settings: Settings,
    scope: CoroutineScope,
    onDirty: () -> Unit,
    onExit: () -> Unit,
) {
    data class Feedback(val correct: Boolean, val rating: Rating)

    var items by remember { mutableStateOf<List<Item>>(emptyList()) }
    var index by remember { mutableStateOf(0) }
    var question by remember { mutableStateOf<Question?>(null) }
    var selected by remember { mutableStateOf<List<Int>>(emptyList()) }
    var feedback by remember { mutableStateOf<Feedback?>(null) }
    var done by remember { mutableStateOf(false) }
    var revealed by remember { mutableStateOf(false) }
    var correctCount by remember { mutableStateOf(0) }

    LaunchedEffect(mode) {
        val now = System.currentTimeMillis()
        val cards = store.allCards()
        val logs = store.allLogs()
        items = Queue.build(mode, settings, cards, vocab, now, Queue.newIntroducedToday(logs, now))
        if (items.isEmpty()) {
            done = true
        } else {
            question = Questions.generate(items[0], settings, vocab)
            revealed = items[0] !is Item.New
        }
    }

    fun advance() {
        val nextIndex = index + 1
        if (nextIndex >= items.size) {
            done = true
            onDirty()
            return
        }
        index = nextIndex
        selected = emptyList()
        feedback = null
        revealed = items[nextIndex] !is Item.New
        question = Questions.generate(items[nextIndex], settings, vocab)
    }

    fun submitRating(rating: Rating) {
        val q = question ?: return
        val word = q.entry.w
        scope.launch {
            runner.grade(word, null, rating, "self", emptyList())
            feedback = Feedback(rating >= Rating.GOOD, rating)
            if (rating >= Rating.GOOD) correctCount++
        }
    }

    fun submitSelection(sel: List<Int>) {
        val q = question ?: return
        val (rating, senses) = Questions.grade(q, sel)
        val tested = senses
        scope.launch {
            runner.grade(q.entry.w, null, rating, q.javaClass.simpleName, tested)
            for (i in tested) runner.grade(q.entry.w, i, rating, q.javaClass.simpleName, listOf(i))
            if (rating >= Rating.GOOD) correctCount++
            feedback = Feedback(rating >= Rating.GOOD, rating)
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${index + 1} / ${items.size}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            LinearProgressIndicator(
                progress = { if (items.isEmpty()) 0f else index.toFloat() / items.size },
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onExit) { Text("退出") }
        }

        if (done) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("会话完成", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                Text("答对 $correctCount / ${items.size}", style = MaterialTheme.typography.titleMedium)
                Text(
                    "FSRS 已根据本轮表现更新调度;答错的词会更快再次出现。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                )
                Button(onClick = onExit) { Text("返回今天") }
            }
        } else {
            val q = question
            if (q != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(q.entry.w, fontSize = 34.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                            AssistChip(onClick = {}, label = { Text(q.entry.p ?: "") })
                            AssistChip(
                                onClick = {},
                                label = { Text(if (q.entry.lv == 1) "CET-4" else if (q.entry.lv == 2) "CET-6" else "CET-4·6") },
                            )
                        }
                        val showSenses = q is Question.Self && revealed
                        if (showSenses) {
                            for ((i, sense) in (q as Question.Self).senses) {
                                Text("• ${if (sense.pos.isNotEmpty()) sense.pos + " " else ""}${sense.cn}")
                            }
                        }
                    }
                }

                when (q) {
                    is Question.Self -> {
                        if (!revealed) {
                            Button(onClick = { revealed = true }, modifier = Modifier.fillMaxWidth()) { Text("显示释义 REVEAL") }
                        } else if (feedback == null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                gradeButton("忘记", Rating.AGAIN, Modifier.weight(1f)) { submitRating(it) }
                                gradeButton("困难", Rating.HARD, Modifier.weight(1f)) { submitRating(it) }
                                gradeButton("记得", Rating.GOOD, Modifier.weight(1f)) { submitRating(it) }
                                gradeButton("简单", Rating.EASY, Modifier.weight(1f)) { submitRating(it) }
                            }
                        }
                    }
                    is Question.Choice -> {
                        Text("选出正确释义", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        q.options.forEachIndexed { i, opt ->
                            val chosen = selected.contains(i)
                            val truth = feedback != null && opt.correct
                            val wrong = feedback != null && chosen && !opt.correct
                            Surface(
                                color = when {
                                    truth -> MaterialTheme.colorScheme.primary
                                    wrong -> MaterialTheme.colorScheme.surface
                                    chosen -> MaterialTheme.colorScheme.surface
                                    else -> MaterialTheme.colorScheme.surface
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = feedback == null) {
                                        selected = listOf(i)
                                        submitSelection(listOf(i))
                                    },
                            ) {
                                Text(
                                    opt.text,
                                    Modifier.padding(14.dp),
                                    color = when {
                                        truth -> MaterialTheme.colorScheme.onPrimary
                                        wrong -> MaterialTheme.colorScheme.error
                                        else -> MaterialTheme.colorScheme.onSurface
                                    },
                                )
                            }
                        }
                    }
                    is Question.Multi -> {
                        Text("选出全部正确释义(多选)", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        q.options.forEachIndexed { i, opt ->
                            val chosen = selected.contains(i)
                            val truth = feedback != null && opt.correct
                            Surface(
                                color = when {
                                    truth -> MaterialTheme.colorScheme.primary
                                    chosen -> MaterialTheme.colorScheme.surfaceVariant
                                    else -> MaterialTheme.colorScheme.surface
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = feedback == null) {
                                        selected = if (chosen) selected - i else selected + i
                                    },
                            ) {
                                Text(
                                    (if (chosen) "☑ " else "☐ ") + opt.text,
                                    Modifier.padding(14.dp),
                                    color = if (truth) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                        if (feedback == null) {
                            Button(
                                onClick = { submitSelection(selected) },
                                enabled = selected.isNotEmpty(),
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("提交 SUBMIT") }
                        }
                    }
                }

                if (feedback != null) {
                    val f = feedback!!
                    Surface(color = if (f.correct) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surfaceVariant) {
                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                if (f.correct) "正确 · VERIFIED" else "未通过 · REQUEUED",
                                color = if (f.correct) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary,
                            )
                            Button(onClick = { advance() }, modifier = Modifier.fillMaxWidth()) { Text("继续 CONTINUE") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun gradeButton(label: String, rating: Rating, modifier: Modifier, onGrade: (Rating) -> Unit) {
    OutlinedButton(onClick = { onGrade(rating) }, modifier = modifier) { Text(label) }
}

/* ==========================================================================
   Library screen - search + list + detail sheet (per-sense tiers)
   ========================================================================== */

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    vocab: Vocab,
    store: Store,
    runner: SessionRunner,
    scope: CoroutineScope,
    onDirty: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var cards by remember { mutableStateOf<List<Card>>(emptyList()) }
    var detail by remember { mutableStateOf<com.lexfield.app.data.VocabEntry?>(null) }

    fun reload() {
        cards = store.allCards()
    }
    LaunchedEffect(Unit) { reload() }

    val cardByWord = cards.filter { it.senseIdx == null }.associateBy { it.word }
    val filtered = vocab.all()
        .filter { query.isBlank() || it.w.lowercase().contains(query.trim().lowercase()) }
        .take(200)

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("词库档案 ${vocab.size}", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("搜索单词…(前 200 条)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        LazyColumn(Modifier.fillMaxSize()) {
            items(filtered, key = { it.w }) { entry ->
                val card = cardByWord[entry.w]
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clickable { detail = entry }
                        .padding(vertical = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(entry.w, fontSize = 16.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                        Text(entry.p ?: "", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (card != null) {
                            Text(
                                when (card.tier) {
                                    Tier.EASY -> "简单"
                                    Tier.HARD -> "困难"
                                    Tier.MEDIUM -> "中等"
                                },
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    Text(
                        entry.s.take(2).joinToString(";") { s -> if (s.pos.isNotEmpty()) "${s.pos} ${s.cn}" else s.cn },
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
            }
        }
    }

    if (detail != null) {
        val entry = detail!!
        ModalBottomSheet(onDismissRequest = { detail = null }) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(entry.w, fontSize = 30.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                Text(entry.p ?: "", color = MaterialTheme.colorScheme.primary)
                Text("单词分级", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tier.entries.forEach { tier ->
                        FilterChip(
                            selected = cardByWord[entry.w]?.tier == tier || (cardByWord[entry.w] == null && tier == Tier.MEDIUM),
                            onClick = {
                                scope.launch {
                                    runner.ensureWordCard(entry.w)
                                    runner.setTier(entry.w, tier)
                                    reload()
                                    onDirty()
                                }
                            },
                            label = {
                                Text(
                                    when (tier) {
                                        Tier.EASY -> "简单"
                                        Tier.MEDIUM -> "中等"
                                        Tier.HARD -> "困难"
                                    },
                                )
                            },
                        )
                    }
                }
                Text("义项分级(每个汉语意思独立)", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                entry.s.forEachIndexed { i, sense ->
                    Column {
                        Text("${if (sense.pos.isNotEmpty()) sense.pos + " " else ""}${sense.cn}")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Tier.entries.forEach { tier ->
                                val senseCard = cards.firstOrNull { it.word == entry.w && it.senseIdx == i }
                                FilterChip(
                                    selected = (senseCard?.tier ?: Tier.MEDIUM) == tier,
                                    onClick = {
                                        scope.launch {
                                            runner.ensureWordCard(entry.w)
                                            runner.setSenseTier(entry.w, i, tier)
                                            reload()
                                        }
                                    },
                                    label = {
                                        Text(
                                            when (tier) {
                                                Tier.EASY -> "简"
                                                Tier.MEDIUM -> "中"
                                                Tier.HARD -> "难"
                                            },
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = {
                        scope.launch {
                            runner.ensureWordCard(entry.w)
                            runner.setSuspended(entry.w, cardByWord[entry.w]?.suspended != true)
                            reload()
                        }
                    }) { Text("挂起/恢复") }
                    OutlinedButton(onClick = {
                        scope.launch {
                            runner.ensureWordCard(entry.w)
                            runner.reset(entry.w)
                            reload()
                            onDirty()
                        }
                    }) { Text("重置") }
                }
                Spacer(Modifier.height(30.dp))
            }
        }
    }
}

/* ==========================================================================
   Stats screen
   ========================================================================== */

@Composable
fun StatsScreen(store: Store, vocab: Vocab, settings: Settings) {
    data class Snapshot(val n: Int, val r: Int, val m: Int, val forecast: Map<Int, Int>, val todayDay: Long)

    var snap by remember { mutableStateOf<Snapshot?>(null) }
    LaunchedEffect(Unit) {
        val now = System.currentTimeMillis()
        val todayDay = now / DAY
        var n = 0
        var r = 0
        var m = 0
        val f = HashMap<Int, Int>()
        for (c in store.allCards().filter { it.senseIdx == null }) {
            when {
                c.state == CardState.NEW -> n++
                c.state == CardState.REVIEW -> {
                    if (c.stability >= 21.0) m++ else r++
                    val day = c.due / DAY
                    if (day >= todayDay && day < todayDay + 14) f[day.toInt()] = (f[day.toInt()] ?: 0) + 1
                }
            }
        }
        snap = Snapshot(n, r, m, f, todayDay)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("记忆遥测", style = MaterialTheme.typography.headlineSmall)
        val s = snap
        if (s == null) {
            Text("统计计算中…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                statBox("新词", s.n, Modifier.weight(1f))
                statBox("记忆中", s.r, Modifier.weight(1f))
                statBox("巩固", s.m, Modifier.weight(1f))
            }
            Text("未来 14 天到期", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val maxF = max(1, s.forecast.values.maxOrNull() ?: 1)
            for (i in 0 until 14) {
                val day = s.todayDay + i
                val count = s.forecast[day.toInt()] ?: 0
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        if (i == 0) "今天" else "${day % 100}",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(36.dp),
                    )
                    LinearProgressIndicator(progress = { count.toFloat() / maxF }, modifier = Modifier.weight(1f))
                    Text("$count", fontSize = 10.sp, modifier = Modifier.width(24.dp))
                }
            }
        }
    }
}

@Composable
private fun statBox(label: String, value: Int, modifier: Modifier = Modifier) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(Modifier.padding(12.dp)) {
            Text("$value", fontSize = 26.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
