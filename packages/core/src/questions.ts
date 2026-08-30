import type { Grade } from 'ts-fsrs'
import type { QueueItem } from './queue'
import type { QuestionType, Sense, Settings, VocabEntry } from './types'
import { buildSensePool, type SenseIndexItem, type VocabProvider } from './vocab'

export interface QuestionOption {
  /** displayed text, e.g. "vt. 放弃；抛弃" */
  text: string
  correct: boolean
  /** sense index within the tested word (distractors: index within their own word) */
  senseIdx: number
}

export type Question =
  | {
      type: 'self'
      ref: { w: string; s: null }
      entry: VocabEntry
      /** senses to reveal - a random split of the word's meanings */
      senses: Sense[]
      senseIdxes: number[]
    }
  | {
      type: 'choice'
      ref: { w: string; s: null }
      entry: VocabEntry
      /** the tested meaning */
      target: Sense
      targetIdx: number
      options: QuestionOption[]
    }
  | {
      type: 'multi'
      ref: { w: string; s: null }
      entry: VocabEntry
      /** all correct meanings, mixed into options */
      targets: Sense[]
      targetIdxes: number[]
      options: QuestionOption[]
    }

export interface QuestionEngineInput {
  item: QueueItem
  settings: Settings
  vocab: VocabProvider
  /** prebuilt via buildSensePool - pass once per session for performance */
  sensePool: SenseIndexItem[]
  rng?: () => number
}

export function generateQuestion(input: QuestionEngineInput): Question {
  const { item, settings, sensePool } = input
  const entry = item.entry
  const rng = input.rng ?? Math.random
  const type = pickQuestionType(settings, rng)
  if (type === 'self') {
    const { senses, idxes } = splitSenses(entry, settings.sensesPerShow, rng)
    return { type: 'self', ref: item.ref, entry, senses, senseIdxes: idxes }
  }
  if (type === 'choice') {
    const targetIdx = Math.floor(rng() * entry.s.length)
    const target = entry.s[targetIdx]!
    const options = sampleOptions(entry, targetIdx, 1, settings.choiceOptions, sensePool, rng)
    return { type: 'choice', ref: item.ref, entry, target, targetIdx, options }
  }
  const want = settings.sensesPerShow > 0 ? settings.sensesPerShow : entry.s.length
  const k = Math.max(1, Math.min(want, entry.s.length))
  const idxes = sampleIndexes(entry.s.length, k, rng)
  const options = sampleOptions(entry, idxes, k, settings.multiOptions, sensePool, rng)
  return {
    type: 'multi',
    ref: item.ref,
    entry,
    targets: idxes.map((i) => entry.s[i]!),
    targetIdxes: idxes,
    options,
  }
}

/** random split of a word's meanings: 0 = all, else N (clamped) */
export function splitSenses(entry: VocabEntry, n: number, rng: () => number) {
  const count = n <= 0 ? entry.s.length : Math.min(n, entry.s.length)
  const idxes = sampleIndexes(entry.s.length, count, rng)
  return { senses: idxes.map((i) => entry.s[i]!), idxes }
}

function pickQuestionType(settings: Settings, rng: () => number): QuestionType {
  const w = settings.questionWeights
  const total = w.self + w.choice + w.multi
  if (total <= 0) return 'self'
  let roll = rng() * total
  if ((roll -= w.self) < 0) return 'self'
  if ((roll -= w.choice) < 0) return 'choice'
  return 'multi'
}

function sampleIndexes(length: number, k: number, rng: () => number): number[] {
  const all = Array.from({ length }, (_, i) => i)
  // partial Fisher-Yates
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (length - i))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
  }
  return all.slice(0, k)
}

/**
 * Sample distractor meanings from other words. Same-POS senses are preferred
 * and frequency-rank proximity weighs the choice, so options feel plausible.
 */
function sampleOptions(
  entry: VocabEntry,
  correctIdx: number | number[],
  correctCount: number,
  totalOptions: number,
  pool: SenseIndexItem[],
  rng: () => number,
): QuestionOption[] {
  const correctList = Array.isArray(correctIdx) ? correctIdx : [correctIdx]
  const correctSet = new Set(correctList)
  const correctTexts = new Set(correctList.map((i) => entry.s[i]!.cn))
  const targetPos = entry.s[correctList[0]!]!.pos

  const distractorCount = Math.max(0, totalOptions - correctCount)
  const candidates: { item: SenseIndexItem; score: number }[] = []
  const targetRank = entry.f ?? Number.MAX_SAFE_INTEGER
  for (const s of pool) {
    if (s.w === entry.w) continue
    if (correctTexts.has(s.cn)) continue
    const rank = s.f === Number.MAX_SAFE_INTEGER ? targetRank : s.f
    const freqCloseness = 1 / (1 + Math.abs(rank - targetRank) / 800)
    const posBonus = s.pos !== '' && s.pos === targetPos ? 1.6 : 1
    candidates.push({ item: s, score: freqCloseness * posBonus * (0.25 + rng()) })
  }
  // top-K by score
  candidates.sort((a, b) => b.score - a.score)
  const distractors = candidates.slice(0, distractorCount)

  const options: QuestionOption[] = correctList.map((i) => ({
    text: formatSense(entry.s[i]!),
    correct: true,
    senseIdx: i,
  }))
  for (const d of distractors) {
    options.push({ text: formatSense({ pos: d.item.pos, cn: d.item.cn }), correct: false, senseIdx: -1 })
  }
  return shuffle(options, rng)
}

export function formatSense(s: Sense): string {
  return s.pos ? `${s.pos} ${s.cn}` : s.cn
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export interface GradeResult {
  rating: Grade
  /** sense indexes the rating should apply to (on the tested word's cards) */
  sensesTested: number[]
}

/**
 * Auto-grade a choice/multi answer.
 * - choice: correct -> Good, wrong -> Again
 * - multi: all correct -> Good, partial -> Hard, none -> Again
 * The word-level card is always affected; correct target senses are updated too.
 */
export function gradeAnswer(q: Question, selectedIdxes: number[]): GradeResult {
  if (q.type === 'self') throw new Error('self questions are graded by the user, not by selection')
  const correctSet = new Set(
    q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0),
  )
  const selected = new Set(selectedIdxes)
  let hits = 0
  let misses = 0
  for (const i of selected) {
    if (correctSet.has(i)) hits++
    else misses++
  }
  const full = hits === correctSet.size && misses === 0
  const rating: Grade = full ? 3 : hits > 0 ? 2 : 1
  const sensesTested =
    q.type === 'choice' ? [q.targetIdx] : [...q.targetIdxes]
  return { rating, sensesTested }
}
