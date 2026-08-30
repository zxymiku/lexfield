import type { Card } from 'ts-fsrs'

/** bit flags: 1 = CET-4, 2 = CET-6, 3 = both */
export type Level = 1 | 2 | 3

export type Tier = 'easy' | 'medium' | 'hard'
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard']

/** one Chinese meaning of a word (from ECDICT translation, never truncated) */
export interface Sense {
  pos: string
  cn: string
}

export interface VocabEntry {
  /** head word */
  w: string
  /** level bit flags */
  lv: Level
  /** ALL senses */
  s: Sense[]
  /** phonetic */
  p?: string
  /** english definitions */
  en?: string[]
  /** word forms: p past / d participle / i -ing / 3 third / s plural / r comparative / t superlative */
  x?: Record<string, string>
  /** contemporary corpus frequency rank (lower = more frequent) */
  f?: number
  /** BNC rank */
  b?: number
  /** Collins star 1-5 */
  c?: number
}

export interface VocabFile {
  v: number
  n: number
  words: VocabEntry[]
}

/** scheduling target: s = sense index, null = the word as a whole */
export interface CardRef {
  w: string
  s: number | null
}

export interface CardRecord {
  w: string
  s: number | null
  /** ts-fsrs Card (Date fields become ISO strings on disk) */
  fsrs: Card
  tier: Tier
  suspended: boolean
  updatedAt: number
  /** sync tombstone */
  deleted?: boolean
}

export type QuestionType = 'self' | 'choice' | 'multi'
export type Mode = 'learn' | 'review' | 'mix'

export interface ReviewLogRecord {
  w: string
  s: number | null
  at: number
  rating: 1 | 2 | 3 | 4
  q: QuestionType
  /** sense indexes the rating applies to (word-level log stores tested senses too) */
  senses: number[]
}

export interface Settings {
  /** target retention for 'medium' tier; easy/hard shift by tierRetentionDelta */
  baseRetention: number
  tierRetentionDelta: number
  dailyNew: number
  mode: Mode
  /** share of new cards in mix mode, 0..1 */
  mixRatio: number
  /** which levels to study (bit flags) */
  levelFilter: Level
  newOrder: 'frequency' | 'alphabetical' | 'file'
  /** appearance weight of due cards by tier in random sampling */
  tierWeights: Record<Tier, number>
  /** max appearances per day per tier, 0 = unlimited */
  tierDailyCaps: Record<Tier, number>
  questionWeights: { self: number; choice: number; multi: number }
  /** senses shown per self/multi question, 0 = all */
  sensesPerShow: number
  choiceOptions: number
  multiOptions: number
  /** total graded items per day, 0 = unlimited */
  dailyLimit: number
  syncUrl?: string
  syncToken?: string
  syncUser?: string
}

export const DEFAULT_SETTINGS: Settings = {
  baseRetention: 0.9,
  tierRetentionDelta: 0.05,
  dailyNew: 15,
  mode: 'mix',
  mixRatio: 0.25,
  levelFilter: 3,
  newOrder: 'frequency',
  tierWeights: { easy: 1, medium: 2, hard: 3 },
  tierDailyCaps: { easy: 0, medium: 0, hard: 0 },
  questionWeights: { self: 0.4, choice: 0.4, multi: 0.2 },
  sensesPerShow: 0,
  choiceOptions: 4,
  multiOptions: 6,
  dailyLimit: 0,
}
