package com.lexfield.app.session

import com.lexfield.app.data.Card
import com.lexfield.app.data.ReviewLog
import com.lexfield.app.data.Settings
import com.lexfield.app.data.Store
import com.lexfield.app.data.Vocab
import com.lexfield.app.data.VocabEntry
import com.lexfield.app.fsrs.CardState
import com.lexfield.app.fsrs.FsrsParams
import com.lexfield.app.fsrs.Fsrs
import com.lexfield.app.fsrs.Rating
import com.lexfield.app.fsrs.Tier
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

const val MINUTE: Long = 60_000L
const val DAY: Long = 86_400_000L

// ---------------------------------------------------------------------------
// session queue
// ---------------------------------------------------------------------------

sealed class Item {
    abstract val entry: VocabEntry
    abstract val kind: String

    data class New(override val entry: VocabEntry) : Item() {
        override val kind = "new"
    }
    data class Due(override val entry: VocabEntry, val card: Card) : Item() {
        override val kind = "due"
    }
    data class Learning(override val entry: VocabEntry, val card: Card) : Item() {
        override val kind = "learning"
    }
}

object Queue {

    fun build(
        mode: String,
        settings: Settings,
        cards: List<Card>,
        vocab: Vocab,
        now: Long,
        newIntroducedToday: Int,
    ): List<Item> {
        val seen = HashSet<String>()
        val learning = ArrayList<Item.Learning>()
        val due = ArrayList<Item.Due>()
        for (c in cards) {
            if (c.suspended || c.senseIdx != null) continue
            seen.add(c.word)
            val entry = vocab.byWord(c.word) ?: continue
            when {
                (c.state == CardState.LEARNING || c.state == CardState.RELEARNING) && c.due <= now ->
                    learning.add(Item.Learning(entry, c))
                c.state == CardState.REVIEW && c.due <= now ->
                    due.add(Item.Due(entry, c))
            }
        }
        val items = ArrayList<Item>(learning)
        if (mode == "learn") {
            val allow = max(0, settings.dailyNew - newIntroducedToday)
            items += newQueue(settings, vocab, seen, allow)
            return items
        }
        if (mode == "review") {
            due.sortedBy { it.card.due }.forEach { items.add(it) }
            return items
        }
        // mix: interleave due and new by mixRatio (rng-based like the TS core)
        val duePool = due.toMutableList()
        val newPool = newQueue(settings, vocab, seen, max(0, settings.dailyNew - newIntroducedToday)).toMutableList()
        val rng = Random.Default
        var progress = 0
        while (duePool.isNotEmpty() || newPool.isNotEmpty()) {
            val takeNew = newPool.isNotEmpty() &&
                (duePool.isEmpty() || (progress > 0 && rng.nextDouble() < settings.mixRatio))
            when {
                takeNew -> items.add(newPool.removeAt(0))
                duePool.isNotEmpty() -> items.add(duePool.removeAt(0))
                else -> items.add(newPool.removeAt(0))
            }
            progress++
        }
        return items
    }

    private fun newQueue(
        settings: Settings,
        vocab: Vocab,
        seen: Set<String>,
        allow: Int,
    ): List<Item.New> {
        if (allow <= 0) return emptyList()
        return vocab.all()
            .filter { !seen.contains(it.w) && (it.lv and settings.levelFilter) != 0 }
            .sortedBy { it.f }
            .take(allow)
            .map { Item.New(it) }
    }

    fun newIntroducedToday(logs: List<JSONObjectCompat>, now: Long): Int {
        val start = startOfDay(now)
        return logs.filter { it.optString("s", "null") == "null" && it.optLong("at") >= start }
            .map { it.optString("w") }
            .toSet()
            .size
    }

    fun startOfDay(now: Long): Long {
        val cal = java.util.Calendar.getInstance()
        cal.timeInMillis = now
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }
}

typealias JSONObjectCompat = org.json.JSONObject

// ---------------------------------------------------------------------------
// question engine (self / single-choice / multi-choice, sense splitting)
// ---------------------------------------------------------------------------

data class Option(val text: String, val correct: Boolean, val senseIdx: Int)

sealed class Question {
    abstract val entry: VocabEntry

    data class Self(
        override val entry: VocabEntry,
        val senses: List<Pair<Int, com.lexfield.app.data.Sense>>,
    ) : Question()

    data class Choice(
        override val entry: VocabEntry,
        val targetIdx: Int,
        val options: List<Option>,
    ) : Question()

    data class Multi(
        override val entry: VocabEntry,
        val targetIdxes: List<Int>,
        val options: List<Option>,
    ) : Question()
}

object Questions {

    fun generate(item: Item, settings: Settings, vocab: Vocab, rng: Random = Random.Default): Question {
        val entry = item.entry
        val type = pickType(settings, rng)
        return when (type) {
            0 -> {
                val idxes = sampleIdxes(entry.s.size, entry.s.size, rng)
                Question.Self(entry, idxes.map { it to entry.s[it] })
            }
            1 -> {
                val target = rng.nextInt(entry.s.size)
                Question.Choice(entry, target, sampleOptions(entry, listOf(target), 1, 4, vocab, rng))
            }
            else -> {
                val k = max(1, min(2, entry.s.size))
                val idxes = sampleIdxes(entry.s.size, k, rng)
                Question.Multi(entry, idxes, sampleOptions(entry, idxes, k, 6, vocab, rng))
            }
        }
    }

    private fun pickType(settings: Settings, rng: Random): Int {
        val (self, choice, multi) = settings.questionWeights
        val total = self + choice + multi
        if (total <= 0.0) return 0
        var roll = rng.nextDouble() * total
        if ((roll -= self) < 0) return 0
        if ((roll -= choice) < 0) return 1
        return 2
    }

    private fun sampleIdxes(n: Int, k: Int, rng: Random): List<Int> {
        val all = (0 until n).toMutableList()
        all.shuffle(rng)
        return all.take(k)
    }

    fun sampleOptions(
        entry: VocabEntry,
        correctIdxes: List<Int>,
        correctCount: Int,
        totalOptions: Int,
        vocab: Vocab,
        rng: Random,
    ): List<Option> {
        val correctTexts = correctIdxes.map { entry.senseText(it) }.toSet()
        val targetPos = entry.s[correctIdxes.first()].pos
        val distractorCount = max(0, totalOptions - correctCount)
        val candidates = ArrayList<Pair<VocabEntry, Int>>()
        for (e in vocab.all()) {
            if (e.w == entry.w) continue
            for (i in e.s.indices) {
                if (correctTexts.contains(e.senseText(i))) continue
                candidates.add(e to i)
            }
        }
        candidates.shuffle(rng)
        // prefer same-POS distractors, cap total scans
        val samePos = candidates.filter { it.first.s[it.second].pos.isNotEmpty() && it.first.s[it.second].pos == targetPos }
        val chosen = (samePos + candidates).distinct().take(distractorCount)
        val options = correctIdxes.map { Option(entry.senseText(it), true, it) }.toMutableList()
        for ((e, i) in chosen) options.add(Option(e.senseText(i), false, i))
        options.shuffle(rng)
        return options
    }

    /** returns rating + tested sense indexes (mirror of the TS gradeAnswer) */
    fun grade(q: Question, selected: List<Int>): Pair<Rating, List<Int>> {
        return when (q) {
            is Question.Self -> error("self questions grade directly")
            is Question.Choice -> {
                val correct = selected.size == 1 && q.options[selected.first()].correct
                if (correct) Rating.GOOD to listOf(q.targetIdx) else Rating.AGAIN to listOf(q.targetIdx)
            }
            is Question.Multi -> {
                val correctSet = q.options.withIndex().filter { it.value.correct }.map { it.index }.toSet()
                val hits = selected.count { it in correctSet }
                val misses = selected.size - hits
                val rating = when {
                    hits == correctSet.size && misses == 0 -> Rating.GOOD
                    hits > 0 -> Rating.HARD
                    else -> Rating.AGAIN
                }
                rating to q.targetIdxes
            }
        }
    }
}

// ---------------------------------------------------------------------------
// session runner: persists grades (word card + tested sense cards)
// ---------------------------------------------------------------------------

class SessionRunner(
    private val store: Store,
    private val vocab: Vocab,
    private val settings: Settings,
    private val now: Long = System.currentTimeMillis(),
) {
    private val fsrs = Fsrs()

    fun ensureWordCard(word: String): Card {
        val key = "w:$word"
        val existing = store.allCards().firstOrNull { it.key == key }
        if (existing != null) return existing
        val card = Card(
            word = word, senseIdx = null, state = CardState.NEW, due = now,
            stability = 0.0, difficulty = 0.0, step = 0, reps = 0, lapses = 0,
            lastReview = null, tier = Tier.MEDIUM, suspended = false, updatedAt = now,
        )
        store.putCard(card)
        return card
    }

    fun grade(word: String, senseIdx: Int?, rating: Rating, question: String, senses: List<Int>) {
        val card = if (senseIdx == null) ensureWordCard(word) else ensureSenseCard(word, senseIdx)
        val retention = settings.retentionFor(card.tier)
        val updated = applyRating(card, rating, retention)
        store.putCard(updated)
        store.addLog(ReviewLog(word, senseIdx, now, rating.v, question, senses))
    }

    private fun ensureSenseCard(word: String, senseIdx: Int): Card {
        val key = "s:$word:$senseIdx"
        val existing = store.allCards().firstOrNull { it.key == key }
        if (existing != null) return existing
        val card = Card(
            word = word, senseIdx = senseIdx, state = CardState.NEW, due = now,
            stability = 0.0, difficulty = 0.0, step = 0, reps = 0, lapses = 0,
            lastReview = null, tier = Tier.MEDIUM, suspended = false, updatedAt = now,
        )
        store.putCard(card)
        return card
    }

    fun setTier(word: String, tier: Tier) {
        for (c in store.allCards().filter { it.word == word }) {
            c.tier = tier
            c.updatedAt = System.currentTimeMillis()
            store.putCard(c)
        }
    }

    /** set tier on a single sense card (created lazily) without advancing its schedule */
    fun setSenseTier(word: String, senseIdx: Int, tier: Tier) {
        val c = ensureSenseCard(word, senseIdx)
        c.tier = tier
        c.updatedAt = System.currentTimeMillis()
        store.putCard(c)
    }

    fun setSuspended(word: String, suspended: Boolean) {
        val c = ensureWordCard(word)
        c.suspended = suspended
        c.updatedAt = System.currentTimeMillis()
        store.putCard(c)
    }

    fun reset(word: String) {
        val c = ensureWordCard(word)
        c.state = CardState.NEW
        c.stability = 0.0
        c.difficulty = 0.0
        c.step = 0
        c.reps = 0
        c.lapses = 0
        c.lastReview = null
        c.due = System.currentTimeMillis()
        c.updatedAt = System.currentTimeMillis()
        store.putCard(c)
    }

    /** FSRS-6 transition incl. learning/relearning steps - mirrors ts-fsrs behavior */
    fun applyRating(card: Card, rating: Rating, retention: Double): Card {
        val nowMs = System.currentTimeMillis()
        val elapsedDays = if (card.lastReview == null) 0.0 else (nowMs - card.lastReview!!).toDouble() / DAY
        var next = card.copy()
        next.reps++
        next.lastReview = nowMs
        next.updatedAt = nowMs

        when (card.state) {
            CardState.NEW -> {
                next.stability = fsrs.initialStability(rating)
                next.difficulty = fsrs.initialDifficulty(rating)
                when (rating) {
                    Rating.EASY -> graduate(next, retention, CardState.REVIEW)
                    Rating.AGAIN -> enterStep(next, CardState.LEARNING, 0)
                    Rating.HARD -> enterStep(next, CardState.LEARNING, 0)
                    Rating.GOOD -> enterStep(next, CardState.LEARNING, 1)
                }
            }
            CardState.LEARNING, CardState.RELEARNING -> {
                val steps = if (card.state == CardState.LEARNING) FsrsParams.LEARNING_STEPS_MINUTES else FsrsParams.RELEARNING_STEPS_MINUTES
                next.stability = fsrs.shortTermStability(card.stability, rating)
                next.difficulty = fsrs.nextDifficulty(card.difficulty, rating)
                when {
                    rating == Rating.EASY -> graduate(next, retention, CardState.REVIEW)
                    rating == Rating.AGAIN -> enterStep(next, card.state, 0)
                    rating == Rating.HARD && card.step > 0 -> enterStep(next, card.state, card.step - 1)
                    card.step >= steps.size - 1 -> graduate(next, retention, CardState.REVIEW)
                    else -> enterStep(next, card.state, card.step + 1)
                }
            }
            CardState.REVIEW -> {
                val r = fsrs.retrievability(elapsedDays, card.stability)
                next.difficulty = fsrs.nextDifficulty(card.difficulty, rating)
                if (rating == Rating.AGAIN) {
                    next.lapses++
                    next.stability = fsrs.stabilityAfterLapse(next.difficulty, card.stability, r)
                    enterStep(next, CardState.RELEARNING, 0)
                } else {
                    next.stability = fsrs.stabilityAfterRecall(next.difficulty, card.stability, r, rating)
                    val interval = fsrs.nextInterval(next.stability).toLong()
                    next.state = CardState.REVIEW
                    next.due = nowMs + interval * DAY
                    next.step = 0
                }
            }
        }
        return next
    }

    private fun enterStep(card: Card, state: CardState, step: Int) {
        card.state = state
        card.step = step
        val steps = if (state == CardState.RELEARNING) FsrsParams.RELEARNING_STEPS_MINUTES else FsrsParams.LEARNING_STEPS_MINUTES
        card.due = System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(steps[step])
    }

    private fun graduate(card: Card, retention: Double, state: CardState) {
        card.state = state
        card.step = 0
        val interval = fsrs.nextInterval(card.stability).toLong()
        card.due = System.currentTimeMillis() + interval * DAY
    }
}
