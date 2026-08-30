package com.lexfield.app.data

import android.content.Context
import com.lexfield.app.fsrs.Tier
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

/** One Chinese meaning of a word */
data class Sense(val pos: String, val cn: String)

data class VocabEntry(
    val w: String,
    /** bit flags: 1 = CET-4, 2 = CET-6, 3 = both */
    val lv: Int,
    val s: List<Sense>,
    val p: String?,
    val en: List<String>,
    val x: Map<String, String>,
    val f: Int,
) {
    fun senseText(i: Int): String {
        val s = s[i]
        return if (s.pos.isNotEmpty()) "${s.pos} ${s.cn}" else s.cn
    }
}

class Vocab private constructor(private val entries: List<VocabEntry>) {
    private val index: Map<String, VocabEntry> = entries.associateBy { it.w }

    val size: Int get() = entries.size

    fun all(): List<VocabEntry> = entries

    fun byWord(word: String): VocabEntry? = index[word]

    companion object {
        fun load(context: Context): Vocab {
            val raw = BufferedReader(
                InputStreamReader(context.assets.open("lexfield-vocab.json"), Charsets.UTF_8),
            ).use { it.readText() }
            val root = JSONObject(raw)
            val words = root.getJSONArray("words")
            val list = ArrayList<VocabEntry>(words.length())
            for (i in 0 until words.length()) {
                val o = words.getJSONObject(i)
                val senses = ArrayList<Sense>()
                val sArr = o.getJSONArray("s")
                for (j in 0 until sArr.length()) {
                    val so = sArr.getJSONObject(j)
                    senses.add(Sense(so.optString("pos", ""), so.getString("cn")))
                }
                if (senses.isEmpty()) continue
                val forms = LinkedHashMap<String, String>()
                if (o.has("x")) {
                    val x = o.getJSONObject("x")
                    for (k in x.keys()) forms[k] = x.getString(k)
                }
                val en = ArrayList<String>()
                if (o.has("en")) {
                    val eArr = o.getJSONArray("en")
                    for (j in 0 until eArr.length()) en.add(eArr.getString(j))
                }
                list.add(
                    VocabEntry(
                        w = o.getString("w"),
                        lv = o.getInt("lv"),
                        s = senses,
                        p = o.optString("p", null),
                        en = en,
                        x = forms,
                        f = if (o.has("f")) o.getInt("f") else Int.MAX_VALUE,
                    ),
                )
            }
            return Vocab(list)
        }
    }
}

/** user-adjustable settings, persisted as JSON in meta table */
data class Settings(
    var baseRetention: Double = 0.90,
    var tierRetentionDelta: Double = 0.05,
    var dailyNew: Int = 15,
    var mixRatio: Double = 0.25,
    var levelFilter: Int = 3,
    var questionWeights: Triple<Double, Double, Double> = Triple(0.4, 0.4, 0.2),
    var syncUrl: String = "",
    var syncToken: String = "",
    var syncUser: String = "",
) {
    fun retentionFor(tier: Tier): Double {
        val d = tierRetentionDelta
        val r = when (tier) {
            Tier.EASY -> baseRetention - d
            Tier.HARD -> baseRetention + d
            Tier.MEDIUM -> baseRetention
        }
        return r.coerceIn(0.80, 0.97)
    }

    fun toJson(): String {
        val o = JSONObject()
        o.put("baseRetention", baseRetention)
        o.put("tierRetentionDelta", tierRetentionDelta)
        o.put("dailyNew", dailyNew)
        o.put("mixRatio", mixRatio)
        o.put("levelFilter", levelFilter)
        o.put("qwSelf", questionWeights.first)
        o.put("qwChoice", questionWeights.second)
        o.put("qwMulti", questionWeights.third)
        o.put("syncUrl", syncUrl)
        o.put("syncUser", syncUser)
        return o.toString()
    }

    companion object {
        fun fromJson(raw: String): Settings {
            val o = JSONObject(raw)
            return Settings(
                baseRetention = o.optDouble("baseRetention", 0.90),
                tierRetentionDelta = o.optDouble("tierRetentionDelta", 0.05),
                dailyNew = o.optInt("dailyNew", 15),
                mixRatio = o.optDouble("mixRatio", 0.25),
                levelFilter = o.optInt("levelFilter", 3),
                questionWeights = Triple(
                    o.optDouble("qwSelf", 0.4),
                    o.optDouble("qwChoice", 0.4),
                    o.optDouble("qwMulti", 0.2),
                ),
                syncUrl = o.optString("syncUrl", ""),
                syncUser = o.optString("syncUser", ""),
                syncToken = "",
            )
        }
    }
}
