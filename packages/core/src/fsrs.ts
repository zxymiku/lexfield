import {
  createEmptyCard,
  fsrs as makeFsrs,
  generatorParameters,
  State,
  type Card,
  type FSRS,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs'
import type { Settings, Tier } from './types'

const engineCache = new Map<string, FSRS>()

/** tier shifts target retention: hard = base+Δ (shorter intervals, more reviews) */
export function retentionForTier(settings: Settings, tier: Tier): number {
  const base = settings.baseRetention
  const d = settings.tierRetentionDelta
  const r = tier === 'easy' ? base - d : tier === 'hard' ? base + d : base
  return Math.min(0.97, Math.max(0.8, r))
}

function engineFor(retention: number): FSRS {
  const key = retention.toFixed(4)
  let engine = engineCache.get(key)
  if (!engine) {
    engine = makeFsrs(
      generatorParameters({
        request_retention: retention,
        enable_fuzz: true,
        enable_short_term: true,
      }),
    )
    engineCache.set(key, engine)
  }
  return engine
}

export function newCard(now = Date.now()): Card {
  return createEmptyCard(new Date(now))
}

export interface GradeOutcome {
  card: Card
  log: ReviewLog
}

export function gradeCard(
  card: Card,
  rating: Grade,
  retention: number,
  now = Date.now(),
): GradeOutcome {
  return engineFor(retention).next(card, new Date(now), rating)
}

/** probability of recall right now (0..1) */
export function retrievability(card: Card, retention: number, now = Date.now()): number {
  if (card.state === State.New) return 0
  const raw = engineFor(retention).get_retrievability(card, new Date(now), false)
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

/** manual full reset back to a fresh card (reps preserved as history, memory wiped) */
export function resetCard(card: Card, now = Date.now()): Card {
  return engineFor(0.9).forget(card, new Date(now), true).card
}

/** ts-fsrs v5 stores due/last_review as Date; tolerate numeric timestamps on load */
export function dueMs(card: Card): number {
  return card.due instanceof Date ? card.due.getTime() : Number(card.due)
}

// ---------------------------------------------------------------------------
// serialization - Date fields become ISO strings on disk
// ---------------------------------------------------------------------------

export function deserializeCard(raw: Card): Card {
  const out = { ...raw }
  if (!(out.due instanceof Date)) out.due = new Date(out.due as unknown as string)
  if (out.last_review && !(out.last_review instanceof Date)) {
    out.last_review = new Date(out.last_review as unknown as string)
  }
  return out
}

export function cardKeyOf(c: { w: string; s: number | null }): string {
  return c.s === null ? `w:${c.w}` : `s:${c.w}:${c.s}`
}
