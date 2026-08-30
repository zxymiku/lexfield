import { State, type Grade } from 'ts-fsrs'
import type { CardRecord, QuestionType, ReviewLogRecord, Settings } from './types'
import type { VocabProvider } from './vocab'
import { cardKeyOf, dueMs, gradeCard, newCard, resetCard, retentionForTier } from './fsrs'
import { computeDueHistogram, type StorageAdapter } from './storage'

const DAY = 86_400_000

/**
 * Load balance: nudge a proposed due day onto the neighboring day (within
 * [-1..+2] of proposal, never before minDay=today) with the fewest scheduled
 * reviews. Pure - the fuzz range itself belongs to ts-fsrs.
 */
export function balanceDay(day: number, hist: Map<number, number>, minDay = 0): number {
  let bestDay = day
  let bestCount = hist.get(day) ?? 0
  for (const offset of [-1, 1, 2]) {
    const probe = day + offset
    if (probe < minDay) continue
    const count = hist.get(probe) ?? 0
    if (count < bestCount) {
      bestCount = count
      bestDay = probe
    }
  }
  return bestDay
}

export interface GradeInput {
  ref: { w: string; s: number | null }
  rating: Grade
  q: QuestionType
  senses: number[]
}

export interface GradeOutput {
  card: CardRecord
  log: ReviewLogRecord
  /** intervals ≥ 1 day may have been nudged to a lighter day */
  balanced: boolean
}

/**
 * Runtime that persists grades: creates word-level cards on first contact,
 * applies tier-based retention, load-balances day-level due dates across the
 * histogram of existing dues, and writes review logs.
 */
export class SessionRunner {
  constructor(
    private storage: StorageAdapter,
    private vocab: VocabProvider,
    private settings: Settings,
    private now = Date.now(),
  ) {}

  private async findCard(ref: { w: string; s: number | null }): Promise<CardRecord | undefined> {
    const key = cardKeyOf(ref)
    return (await this.storage.allCards()).find((c) => cardKeyOf(c) === key)
  }

  async grade(input: GradeInput): Promise<GradeOutput> {
    const { ref, rating, q, senses } = input
    const existing = await this.findCard(ref)
    let record: CardRecord
    let balanced = false
    if (existing) {
      record = existing
    } else {
      record = {
        w: ref.w,
        s: ref.s,
        fsrs: newCard(this.now),
        tier: 'medium',
        suspended: false,
        updatedAt: this.now,
      }
    }

    const retention = retentionForTier(this.settings, record.tier)
    const outcome = gradeCard(record.fsrs, rating, retention, this.now)

    const nextDueMs = dueMs(outcome.card)
    if (nextDueMs - this.now >= DAY && outcome.card.state === State.Review) {
      const hist = computeDueHistogram(await this.storage.allCards(), this.now, 60)
      const day = Math.floor(nextDueMs / DAY)
      const timeOfDay = nextDueMs - day * DAY
      const bestDay = balanceDay(day, hist, Math.floor(this.now / DAY))
      if (bestDay !== day) {
        outcome.card.due = new Date(bestDay * DAY + timeOfDay)
        balanced = true
      }
    }

    const updated: CardRecord = {
      ...record,
      fsrs: outcome.card,
      updatedAt: this.now,
    }
    const log: ReviewLogRecord = {
      w: ref.w,
      s: ref.s,
      at: this.now,
      rating,
      q,
      senses,
    }
    await this.storage.putCard(updated)
    await this.storage.addLog(log)
    return { card: updated, log, balanced }
  }

  /** also updates every sense card of the word when the word tier changes */
  async setWordTier(w: string, tier: CardRecord['tier']): Promise<void> {
    const cards = await this.storage.allCards()
    const affected = cards.filter((c) => c.w === w)
    for (const c of affected) {
      await this.storage.putCard({ ...c, tier, updatedAt: this.now })
    }
  }

  async setTier(ref: { w: string; s: number | null }, tier: CardRecord['tier']): Promise<void> {
    const card = await this.findCard(ref)
    if (card) await this.storage.putCard({ ...card, tier, updatedAt: this.now })
  }

  async setSuspended(ref: { w: string; s: number | null }, suspended: boolean): Promise<void> {
    const card = await this.findCard(ref)
    if (card) await this.storage.putCard({ ...card, suspended, updatedAt: this.now })
  }

  async reset(ref: { w: string; s: number | null }): Promise<void> {
    const card = await this.findCard(ref)
    if (!card) return
    await this.storage.putCard({
      ...card,
      fsrs: resetCard(card.fsrs, this.now),
      updatedAt: this.now,
    })
  }

  async ensureWordCard(w: string, tier: CardRecord['tier'] = 'medium'): Promise<CardRecord> {
    const found = await this.findCard({ w, s: null })
    if (found) return found
    const record: CardRecord = {
      w,
      s: null,
      fsrs: newCard(this.now),
      tier,
      suspended: false,
      updatedAt: this.now,
    }
    await this.storage.putCard(record)
    return record
  }

  /** senses of the word that already have their own card */
  async senseCards(w: string): Promise<CardRecord[]> {
    const cards = await this.storage.allCards()
    return cards.filter((c) => c.w === w && c.s !== null && !c.deleted)
  }
}
