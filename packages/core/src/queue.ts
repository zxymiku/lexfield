import { State } from 'ts-fsrs'
import type { CardRecord, Mode, Settings, VocabEntry } from './types'
import type { VocabProvider } from './vocab'
import { countNewWordsToday, orderNewEntries } from './storage'
import { dueMs } from './fsrs'
import type { ReviewLogRecord } from './types'

const DAY = 86_400_000

export interface QueueItem {
  kind: 'new' | 'due' | 'learning'
  /** for new items this is the (not yet created) word-level ref */
  ref: { w: string; s: null }
  entry: VocabEntry
  card?: CardRecord
}

export interface BuildSessionInput {
  mode: Mode
  settings: Settings
  cards: CardRecord[]
  logs: ReviewLogRecord[]
  vocab: VocabProvider
  now: number
  rng?: () => number
}

/**
 * Assemble the study session.
 *
 * - learning cards (intraday) always come first
 * - due cards are sampled with tier weights (hard:medium:easy = 3:2:1 default)
 *   among the most overdue cards, so harder words appear more often
 * - new words are interleaved according to mixRatio and capped by dailyNew
 */
export function buildSession(input: BuildSessionInput): QueueItem[] {
  const { mode, settings, cards, logs, vocab, now } = input
  const rng = input.rng ?? Math.random

  const learning: QueueItem[] = []
  const due: QueueItem[] = []
  const seenWords = new Set<string>()
  const tierAppearance = new Map<string, number>()

  for (const c of cards) {
    if (c.deleted || c.suspended || c.s !== null) continue
    seenWords.add(c.w)
    const state = c.fsrs.state
    if (state === State.Learning || state === State.Relearning) {
      // intraday steps
      if (dueMs(c.fsrs) <= now) {
        learning.push({ kind: 'learning', ref: { w: c.w, s: null }, entry: vocab.byWord(c.w)!, card: c })
      }
    } else if (state === State.Review && dueMs(c.fsrs) <= now) {
      due.push({ kind: 'due', ref: { w: c.w, s: null }, entry: vocab.byWord(c.w)!, card: c })
    }
  }

  const newAllowed =
    mode === 'review' ? 0 : Math.max(0, settings.dailyNew - countNewWordsToday(logs, now))

  const newItems: QueueItem[] = []
  if (newAllowed > 0) {
    const entries = [...vocab.all()].filter(
      (e) =>
        !seenWords.has(e.w) &&
        (e.lv & settings.levelFilter) !== 0,
    )
    for (const entry of orderNewEntries(entries, settings.newOrder).slice(0, newAllowed)) {
      newItems.push({ kind: 'new', ref: { w: entry.w, s: null }, entry })
    }
  }

  const items: QueueItem[] = []
  for (const l of learning) items.push(l) // intraday steps first, always

  if (mode === 'learn') {
    items.push(...newItems)
    return items.slice(0, settings.dailyLimit > 0 ? settings.dailyLimit : undefined)
  }
  if (mode === 'review') {
    items.push(...sampleDue(due, settings, rng, now, tierAppearance))
    return items
  }

  // mix: interleave due and new according to mixRatio
  const duePool = [...due]
  const newPool = [...newItems]
  while (duePool.length > 0 || newPool.length > 0) {
    const takeNew =
      newPool.length > 0 &&
      (duePool.length === 0 ||
        (items.length - learning.length > 0
          ? rng() < settings.mixRatio
          : false))
    if (takeNew) {
      items.push(newPool.shift()!)
    } else if (duePool.length > 0) {
      items.push(...sampleDue(duePool, settings, rng, now, tierAppearance, 1))
    } else {
      items.push(newPool.shift()!)
    }
    if (settings.dailyLimit > 0 && items.length >= settings.dailyLimit) break
  }
  return items
}

function sampleDue(
  pool: QueueItem[],
  settings: Settings,
  rng: () => number,
  now: number,
  tierAppearance: Map<string, number>,
  count?: number,
): QueueItem[] {
  const picked: QueueItem[] = []
  const n = count ?? pool.length
  // work on the most overdue slice only - keeps sampling cheap and relevant
  const sorted = pool.sort((a, b) => dueMs(a.card!.fsrs) - dueMs(b.card!.fsrs))
  for (let k = 0; k < n && sorted.length > 0; k++) {
    const window = sorted.slice(0, Math.min(20, sorted.length))
    const weights = window.map((item) => {
      const tier = item.card!.tier
      const w = settings.tierWeights[tier] ?? 1
      const overdue = 1 + (now - dueMs(item.card!.fsrs)) / DAY
      const cap = settings.tierDailyCaps[tier] ?? 0
      const seen = tierAppearance.get(tier) ?? 0
      const capFactor = cap > 0 && seen >= cap ? 0 : 1
      return w * overdue * capFactor
    })
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) {
      // every tier in window hit its daily cap
      sorted.splice(0, window.length)
      k--
      continue
    }
    let roll = rng() * total
    let idx = window.length - 1
    for (let i = 0; i < window.length; i++) {
      roll -= weights[i]!
      if (roll <= 0) {
        idx = i
        break
      }
    }
    const item = window[idx]!
    picked.push(item)
    sorted.splice(sorted.indexOf(item), 1)
    tierAppearance.set(item.card!.tier, (tierAppearance.get(item.card!.tier) ?? 0) + 1)
  }
  return picked
}
