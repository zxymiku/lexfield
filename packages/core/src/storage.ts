import type { CardRecord, ReviewLogRecord, Settings, VocabEntry } from './types'
import { State } from 'ts-fsrs'
import { cardKeyOf, dueMs } from './fsrs'

export interface StorageAdapter {
  readonly kind: string
  getSettings(): Promise<Settings>
  putSettings(s: Settings): Promise<void>
  allCards(): Promise<CardRecord[]>
  putCard(c: CardRecord): Promise<void>
  putCards(cards: CardRecord[]): Promise<void>
  addLog(l: ReviewLogRecord): Promise<void>
  /** all logs (bounded by caller); storage keeps full history for future optimizers */
  allLogs(): Promise<ReviewLogRecord[]>
  getMeta<T = unknown>(key: string): Promise<T | undefined>
  putMeta(key: string, value: unknown): Promise<void>
}

const DAY = 86_400_000

/** day number (epoch days) → count of review-state cards due that day */
export function computeDueHistogram(
  cards: CardRecord[],
  from: number,
  days: number,
): Map<number, number> {
  const hist = new Map<number, number>()
  const firstDay = Math.floor(from / DAY)
  for (const c of cards) {
    if (c.deleted || c.suspended) continue
    if (c.fsrs.state !== State.Review && c.fsrs.state !== State.Relearning) continue
    const day = Math.floor(dueMs(c.fsrs) / DAY)
    if (day >= firstDay && day < firstDay + days) {
      hist.set(day, (hist.get(day) ?? 0) + 1)
    }
  }
  return hist
}

/** distinct words first seen in logs since start of day */
export function countNewWordsToday(logs: ReviewLogRecord[], now: number): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const seen = new Set<string>()
  for (const l of logs) {
    if (l.s === null && l.at >= start.getTime()) seen.add(l.w)
  }
  return seen.size
}

export class InMemoryStorage implements StorageAdapter {
  readonly kind = 'memory'
  settings: Settings
  cards = new Map<string, CardRecord>()
  logs: ReviewLogRecord[] = []
  meta = new Map<string, unknown>()

  constructor(settings: Settings) {
    this.settings = settings
  }
  async getSettings() {
    return this.settings
  }
  async putSettings(s: Settings) {
    this.settings = s
  }
  async allCards() {
    return [...this.cards.values()]
  }
  async putCard(c: CardRecord) {
    this.cards.set(cardKeyOf(c), c)
  }
  async putCards(list: CardRecord[]) {
    for (const c of list) this.cards.set(cardKeyOf(c), c)
  }
  async addLog(l: ReviewLogRecord) {
    this.logs.push(l)
  }
  async allLogs() {
    return [...this.logs]
  }
  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined
  }
  async putMeta(key: string, value: unknown) {
    this.meta.set(key, value)
  }
}

/** word-ordering for the new-word queue */
export function orderNewEntries(
  entries: VocabEntry[],
  order: Settings['newOrder'],
): VocabEntry[] {
  const copy = [...entries]
  if (order === 'alphabetical') {
    copy.sort((a, b) => a.w.localeCompare(b.w, 'en'))
  } else if (order === 'frequency') {
    copy.sort((a, b) => (a.f ?? Number.MAX_SAFE_INTEGER) - (b.f ?? Number.MAX_SAFE_INTEGER))
  } // 'file' = pipeline order (frequency-sorted already)
  return copy
}
