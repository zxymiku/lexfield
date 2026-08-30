package com.lexfield.app.fsrs

import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * FSRS-6 (Free Spaced Repetition Scheduler) - Kotlin port of the documented
 * algorithm (open-spaced-repetition, same 21 default weights as ts-fsrs/fsrs-rs).
 *
 * Formulas follow the FSRS wiki ("The Algorithm", FSRS-6):
 *   forgetting curve  R(t,S) = (1 + FACTOR * t/S)^DECAY
 *   interval          I(r,S) = (S/FACTOR) * (r^(1/DECAY) - 1)
 *   initial stability S0(G)  = w[G-1]
 *   initial diff      D0(G)  = w4 - exp(w5*(G-1)) + 1
 *   difficulty update with linear damping + mean reversion
 *   post-lapse / recall / short-term stability per w11..w18
 */
object FsrsParams {
    const val DECAY = -0.5
    const val FACTOR = 19.0 / 81.0

    /** identical to ts-fsrs default_w / fsrs-rs DEFAULT_PARAMETERS (FSRS-6) */
    val DEFAULT_W = doubleArrayOf(
        0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.1511, 0.0019, 1.5717,
        0.0066, 1.6378, 0.9266, 2.9266, 0.0002, 2.2898, 0.2376, 3.9825, 0.5809,
        0.7317, 0.5279, 0.1608,
    )

    const val LEARNING_STEPS_MINUTES = longArrayOf(1, 10)
    const val RELEARNING_STEPS_MINUTES = longArrayOf(10)
}

enum class Rating(val v: Int) { AGAIN(1), HARD(2), GOOD(3), EASY(4) }

enum class CardState { NEW, LEARNING, REVIEW, RELEARNING }

enum class Tier { EASY, MEDIUM, HARD }

data class MemoryState(val stability: Double, val difficulty: Double)

class Fsrs(
    private val w: DoubleArray = FsrsParams.DEFAULT_W,
    /** target retention; easy/medium/hard tiers shift this like the TS core */
    var requestRetention: Double = 0.90,
    private val fuzz: Boolean = true,
) {
    fun forgettingCurve(elapsedDays: Double, stability: Double): Double {
        if (stability <= 0.0) return 0.0
        return (1.0 + FsrsParams.FACTOR * elapsedDays / stability).pow(FsrsParams.DECAY)
    }

    /** interval in days that decays retention to requestRetention */
    fun nextInterval(stability: Double): Int {
        val i = (stability / FsrsParams.FACTOR) *
            (requestRetention.pow(1.0 / FsrsParams.DECAY) - 1.0)
        val rounded = i.roundToInt().coerceAtLeast(1)
        return if (fuzz && rounded >= 3) fuzzInterval(rounded) else rounded
    }

    fun retrievability(elapsedDays: Double, stability: Double): Double =
        forgettingCurve(elapsedDays, stability)

    fun initialStability(g: Rating): Double = w[g.v - 1]

    fun initialDifficulty(g: Rating): Double =
        (w[4] - exp(w[5] * (g.v - 1)) + 1.0).coerceIn(1.0, 10.0)

    fun nextDifficulty(d: Double, g: Rating): Double {
        val delta = -w[6] * (g.v - 3)
        val next = d + delta * (10.0 - d) / 9.0
        return next.coerceIn(1.0, 10.0)
    }

    fun stabilityAfterRecall(d: Double, s: Double, r: Double, g: Rating): Double {
        val hardPenalty = if (g == Rating.HARD) w[15] else 1.0
        val easyBonus = if (g == Rating.EASY) w[16] else 1.0
        val growth = 1 + exp(w[8]) * (11.0 - d) * s.pow(-w[9]) *
            (exp((1.0 - r) * w[10]) - 1.0) * hardPenalty * easyBonus
        return (s * growth).coerceIn(0.1, 36500.0)
    }

    fun stabilityAfterLapse(d: Double, s: Double, r: Double): Double {
        val next = w[11] * d.pow(-w[12]) * ((s + 1.0).pow(w[13]) - 1.0) * exp((1.0 - r) * w[14])
        return min(max(next, 0.1), s)
    }

    /** same-day review stability update */
    fun shortTermStability(s: Double, g: Rating): Double =
        (s * exp(w[17] * (g.v - 3.0 + w[18]))).coerceIn(0.1, 36500.0)

    private fun fuzzInterval(days: Int): Int {
        val spread = max(1, (days * 0.05).roundToInt())
        return days + Random.nextInt(-spread, spread + 1)
    }
}
