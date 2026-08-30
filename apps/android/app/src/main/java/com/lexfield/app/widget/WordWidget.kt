package com.lexfield.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.action.clickable
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.width
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.lexfield.app.MainActivity
import com.lexfield.app.data.Store
import com.lexfield.app.data.Vocab
import com.lexfield.app.data.VocabEntry
import com.lexfield.app.fsrs.CardState
import com.lexfield.app.fsrs.Tier
import kotlin.random.Random

/** Glance's ColorProvider takes day + night; this widget is always dark */
private fun color(c: Color) = ColorProvider(c, c)

/** Endfield palette for the widget surface */
private object WidgetColors {
    val Ink = Color(0xFF191919)
    val Paper = Color(0xFFF2F2F0)
    val PaperMuted = Color(0xFF9C9C96)
    val Signal = Color(0xFFFFFA00)
}

data class WidgetWord(
    val entry: VocabEntry,
    /** why this word: hard tier / lapsed / fallback */
    val reason: String,
)

object WidgetWordSource {
    private const val HOUR_MS = 3_600_000L
    private const val DAY_MS = 86_400_000L

    /**
     * Deterministic per-period pick: the word stays stable within its period
     * (hourly / daily) even if the system refreshes more often. Pool =
     * user-marked hard tier OR lapsed cards (answered wrong from review),
     * falling back to anything in study, then to the full vocabulary.
     */
    fun pick(context: Context): WidgetWord {
        val vocab = Vocab.load(context)
        val store = Store(context)
        val settings = com.lexfield.app.data.Settings.fromJson(
            store.getMeta("settings") ?: "{}",
        )
        val periodMs = if (settings.widgetMode == "daily") DAY_MS else HOUR_MS
        val seed = System.currentTimeMillis() / periodMs
        val rng = Random(seed)

        val cards = store.allCards().filter { it.senseIdx == null && !it.suspended }
        val byWord = cards.associateBy { it.word }

        val hardOrLapsed = cards
            .filter { it.tier == Tier.HARD || it.lapses >= 1 }
            .mapNotNull { vocab.byWord(it.word) }
        val inStudy = cards
            .filter { it.state != CardState.NEW }
            .mapNotNull { vocab.byWord(it.word) }

        val (pool, reason) = when {
            hardOrLapsed.isNotEmpty() -> hardOrLapsed to "困难/易错"
            inStudy.isNotEmpty() -> inStudy to "学习中"
            else -> vocab.all().toList() to "词库随机"
        }
        val entry = pool[rng.nextInt(pool.size)]
        return WidgetWord(entry, reason)
    }
}

class WordWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetWordSource.pick(context)
        // Glance 1.1.x only has the Intent-based actionStartActivity (class-based came in 1.2)
        val openApp = Intent(context, MainActivity::class.java)
        provideContent {
            WidgetContent(data, openApp)
        }
    }
}

@Composable
private fun WidgetContent(data: WidgetWord, openApp: Intent) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(color(WidgetColors.Ink))
            .cornerRadius(14.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .clickable(actionStartActivity(openApp)),
        contentAlignment = Alignment.CenterStart,
    ) {
        Column {
            Text(
                text = "LEXFIELD · ${data.reason}",
                style = TextStyle(
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Normal,
                    color = color(WidgetColors.PaperMuted),
                ),
                maxLines = 1,
            )
            Spacer(GlanceModifier.height(2.dp))
            Row1(data.entry)
            Spacer(GlanceModifier.height(3.dp))
            Text(
                text = data.entry.s.take(2)
                    .joinToString(";") { s -> if (s.pos.isNotEmpty()) "${s.pos} ${s.cn}" else s.cn },
                style = TextStyle(fontSize = 11.sp, color = color(WidgetColors.Paper)),
                maxLines = 2,
            )
        }
    }
}

@Composable
private fun Row1(entry: VocabEntry) {
    androidx.glance.layout.Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = entry.w,
            style = TextStyle(
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = color(WidgetColors.Signal),
            ),
            maxLines = 1,
        )
        if (!entry.p.isNullOrBlank()) {
            Spacer(GlanceModifier.width(6.dp))
            Text(
                text = "/${entry.p}/",
                style = TextStyle(fontSize = 10.sp, color = color(WidgetColors.PaperMuted)),
                maxLines = 1,
            )
        }
    }
}

class WordWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WordWidget()
}
