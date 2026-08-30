import { describe, expect, it } from 'vitest'
import { formatSense, generateQuestion, gradeAnswer } from '../src/questions'
import { buildSensePool, JsonVocab } from '../src/vocab'
import { DEFAULT_SETTINGS, type Settings, type VocabFile } from '../src/types'
import type { QueueItem } from '../src/queue'

const VOCAB: VocabFile = {
  v: 1,
  n: 6,
  words: [
    { w: 'apple', lv: 1, s: [{ pos: 'n.', cn: '苹果' }, { pos: 'n.', cn: '苹果树' }], f: 1200 },
    { w: 'banana', lv: 1, s: [{ pos: 'n.', cn: '香蕉' }], f: 1500 },
    { w: 'cat', lv: 1, s: [{ pos: 'n.', cn: '猫' }], f: 900 },
    { w: 'dog', lv: 1, s: [{ pos: 'n.', cn: '狗' }, { pos: 'vt.', cn: '尾随' }], f: 800 },
    { w: 'run', lv: 1, s: [{ pos: 'v.', cn: '跑' }, { pos: 'n.', cn: '奔跑' }], f: 700 },
    { w: 'elephant', lv: 2, s: [{ pos: 'n.', cn: '象' }], f: 3000 },
  ],
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const vocab = new JsonVocab(VOCAB)
const pool = buildSensePool(vocab)

function itemFor(w: string): QueueItem {
  return { kind: 'due', ref: { w, s: null }, entry: vocab.byWord(w)! }
}

function questionFor(w: string, overrides: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...overrides }
  return generateQuestion({
    item: itemFor(w),
    settings,
    vocab,
    sensePool: pool,
    rng: mulberry32(7),
  })
}

describe('question engine', () => {
  it('choice questions have exactly one correct option and no same-word distractors', () => {
    for (let seed = 0; seed < 30; seed++) {
      const q = generateQuestion({
        item: itemFor('apple'),
        settings: { ...DEFAULT_SETTINGS, questionWeights: { self: 0, choice: 1, multi: 0 } },
        vocab,
        sensePool: pool,
        rng: mulberry32(seed),
      })
      if (q.type !== 'choice') continue
      expect(q.options).toHaveLength(4)
      const correct = q.options.filter((o) => o.correct)
      expect(correct).toHaveLength(1)
      expect(correct[0]!.senseIdx).toBeLessThan(2) // apple has 2 senses
      for (const o of q.options) {
        const fromSameWord = VOCAB.words.find((e) => e.w === 'apple')!.s.some((s) => formatSense(s) === o.text)
        if (!o.correct) expect(fromSameWord).toBe(false)
      }
    }
  })

  it('distractor meanings never equal the correct meaning text', () => {
    for (let seed = 0; seed < 30; seed++) {
      const q = generateQuestion({
        item: itemFor('dog'),
        settings: { ...DEFAULT_SETTINGS, questionWeights: { self: 0, choice: 1, multi: 0 } },
        vocab,
        sensePool: pool,
        rng: mulberry32(100 + seed),
      })
      if (q.type !== 'choice') continue
      const texts = q.options.map((o) => o.text)
      expect(new Set(texts).size).toBe(texts.length)
      expect(texts).toContain(formatSense(q.target))
    }
  })

  it('multi questions mix several correct senses with distractors', () => {
    const q = questionFor('dog', { questionWeights: { self: 0, choice: 0, multi: 1 }, sensesPerShow: 2 })
    expect(q.type).toBe('multi')
    if (q.type !== 'multi') return
    expect(q.targets).toHaveLength(2)
    expect(q.options.filter((o) => o.correct)).toHaveLength(2)
    expect(q.options).toHaveLength(6)
  })

  it('self questions show a random split of meanings (1 at a time when configured)', () => {
    const q = questionFor('apple', { questionWeights: { self: 1, choice: 0, multi: 0 }, sensesPerShow: 1 })
    expect(q.type).toBe('self')
    if (q.type !== 'self') return
    expect(q.senses).toHaveLength(1)
    expect(q.senseIdxes[0]).toBeLessThan(2)
  })

  it('grades choice answers: correct->Good, wrong->Again', () => {
    const q = questionFor('apple', { questionWeights: { self: 0, choice: 1, multi: 0 } })
    if (q.type !== 'choice') throw new Error('expected choice')
    const correctIdx = q.options.findIndex((o) => o.correct)
    expect(gradeAnswer(q, [correctIdx]).rating).toBe(3)
    expect(gradeAnswer(q, [correctIdx]).sensesTested).toEqual([q.targetIdx])
    const wrongIdx = q.options.findIndex((o) => !o.correct)
    expect(gradeAnswer(q, [wrongIdx]).rating).toBe(1)
  })

  it('grades multi answers: full->Good, partial->Hard, none->Again', () => {
    const q = questionFor('dog', { questionWeights: { self: 0, choice: 0, multi: 1 }, sensesPerShow: 2 })
    if (q.type !== 'multi') throw new Error('expected multi')
    const correctIdxes = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0)
    const wrongIdxes = q.options.map((o, i) => (!o.correct ? i : -1)).filter((i) => i >= 0)
    expect(gradeAnswer(q, correctIdxes).rating).toBe(3)
    expect(gradeAnswer(q, [correctIdxes[0]!]).rating).toBe(2)
    expect(gradeAnswer(q, [wrongIdxes[0]!, wrongIdxes[1]!]).rating).toBe(1)
    // tested senses are the word's own correct senses
    expect([...gradeAnswer(q, correctIdxes).sensesTested].sort()).toEqual([...q.targetIdxes].sort())
  })
})
