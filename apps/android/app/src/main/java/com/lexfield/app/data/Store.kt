package com.lexfield.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.lexfield.app.fsrs.CardState
import com.lexfield.app.fsrs.Rating
import com.lexfield.app.fsrs.Tier
import org.json.JSONObject

/** scheduling unit: word as a whole (senseIdx = null) or a single Chinese sense */
data class Card(
    val word: String,
    val senseIdx: Int?,
    var state: CardState,
    /** epoch millis */
    var due: Long,
    var stability: Double,
    var difficulty: Double,
    var step: Int,
    var reps: Int,
    var lapses: Int,
    var lastReview: Long?,
    var tier: Tier,
    var suspended: Boolean,
    var updatedAt: Long,
) {
    val key: String get() = if (senseIdx == null) "w:$word" else "s:$word:$senseIdx"

    fun toJson(): String {
        val o = JSONObject()
        o.put("w", word)
        o.put("s", senseIdx ?: JSONObject.NULL)
        o.put("state", state.name)
        o.put("due", due)
        o.put("stability", stability)
        o.put("difficulty", difficulty)
        o.put("step", step)
        o.put("reps", reps)
        o.put("lapses", lapses)
        o.put("lastReview", lastReview ?: JSONObject.NULL)
        o.put("tier", tier.name)
        o.put("suspended", suspended)
        o.put("updatedAt", updatedAt)
        return o.toString()
    }

    companion object {
        fun fromJson(raw: String): Card {
            val o = JSONObject(raw)
            return Card(
                word = o.getString("w"),
                senseIdx = if (o.isNull("s")) null else o.getInt("s"),
                state = CardState.valueOf(o.getString("state")),
                due = o.getLong("due"),
                stability = o.getDouble("stability"),
                difficulty = o.getDouble("difficulty"),
                step = o.getInt("step"),
                reps = o.getInt("reps"),
                lapses = o.getInt("lapses"),
                lastReview = if (o.isNull("lastReview")) null else o.getLong("lastReview"),
                tier = Tier.valueOf(o.optString("tier", "MEDIUM")),
                suspended = o.optBoolean("suspended", false),
                updatedAt = o.getLong("updatedAt"),
            )
        }
    }
}

data class ReviewLog(
    val word: String,
    val senseIdx: Int?,
    val at: Long,
    val rating: Int,
    val question: String,
    val senses: List<Int>,
) {
    fun toJson(): String {
        val o = JSONObject()
        o.put("w", word)
        o.put("s", senseIdx ?: JSONObject.NULL)
        o.put("at", at)
        o.put("rating", rating)
        o.put("q", question)
        o.put("senses", JSONArray(senses))
        return o.toString()
    }
}

class Store(context: Context) : SQLiteOpenHelper(context, "lexfield.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE cards (key TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun allCards(): List<Card> {
        val out = ArrayList<Card>()
        readableDatabase.rawQuery("SELECT json FROM cards", null).use { c ->
            while (c.moveToNext()) out.add(Card.fromJson(c.getString(0)))
        }
        return out
    }

    fun putCard(card: Card) {
        val v = ContentValues().apply {
            put("key", card.key)
            put("updated_at", card.updatedAt)
            put("json", card.toJson())
        }
        writableDatabase.insertWithOnConflict("cards", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun addLog(log: ReviewLog) {
        val v = ContentValues().apply {
            put("at", log.at)
            put("json", log.toJson())
        }
        writableDatabase.insert("logs", null, v)
    }

    fun allLogs(): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        readableDatabase.rawQuery("SELECT json FROM logs ORDER BY at", null).use { c ->
            while (c.moveToNext()) out.add(JSONObject(c.getString(0)))
        }
        return out
    }

    fun getMeta(key: String): String? =
        readableDatabase.rawQuery("SELECT v FROM meta WHERE k = ?", arrayOf(key)).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    fun putMeta(key: String, value: String) {
        val v = ContentValues().apply {
            put("k", key)
            put("v", value)
        }
        writableDatabase.insertWithOnConflict("meta", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun wipeCards() {
        writableDatabase.execSQL("DELETE FROM cards")
    }
}
