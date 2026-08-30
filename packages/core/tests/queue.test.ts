import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { buildSession, type BuildSessionInput } from '../src/queue'
import { JsonVocab } from '../src/vocab'
import { DEFAULT_SETTINGS, type CardRecord, type Settings, type Tier, type VocabFile } from '../src/types'
import { newCard } from '../src/fsrs'

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = 1_750_000_000_000

const VOCAB: VocabFile = {
  v: 1,
  n: 5,
  words: [
    { w: 'apple', lv: 1, s: [{ pos: 'n.', cn: '苹果' }, { pos: 'n.', cn: '苹果树' }], f: 1200 },
    { w: 'banana', lv: 1, s: [{ pos: 'n.', cn: '香蕉' }, { pos: 'n.', cn: '芭蕉' }], f: 1500 },
    { w: 'cat', lv: 1, s: [{ pos: 'n.', cn: '猫' }], f: 900 },
    { w: 'dog', lv: 1, s: [{ pos: 'n.', cn: '狗' }, { pos: 'vt.', cn: '尾随' }], f: 800 },
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

function cardFor(w: string, state: State, due: number, tier: Tier = 'medium'): CardRecord {
  return {
    w,
    s: null,
    fsrs: {
      ...newCard(NOW - DAY),
      state,
      due: new Date(due),
      stability: 5,
      difficulty: 5,
      reps: 3,
      lapses: 0,
    },
    tier,
    suspended: false,
    updatedAt: NOW - DAY,
  }
}

function makeInput(
  partial: Partial<Omit<BuildSessionInput, 'settings'>> & { settings?: Partial<Settings> },
): BuildSessionInput {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...partial.settings }
  const { settings: _ignored, ...rest } = partial
  return {
    mode: settings.mode,
    settings,
    cards: [],
    logs: [],
    vocab: new JsonVocab(VOCAB),
    now: NOW,
    rng: mulberry32(42),
    ...rest,
  }
}

describe('buildSession', () => {
  it('puts intraday learning cards first, then interleaves due and new', () => {
    const cards = [
      cardFor('banana', State.Learning, NOW - 5 * 60_000),
      cardFor('cat', State.Review, NOW - DAY, 'hard'),
      cardFor('dog', State.Review, NOW - 2 * DAY, 'easy'),
    ]
    const session = buildSession(
      makeInput({ cards, settings: { mode: 'mix', dailyNew: 2, mixRatio: 0.5 } }),
    )
    expect(session[0]!.kind).toBe('learning')
    const kinds = session.slice(1).map((i) => i.kind)
    expect(kinds).toContain('due')
    expect(kinds).toContain('new')
    // both due cards eventually appear (pool drains)
    expect(session.filter((i) => i.kind === 'due')).toHaveLength(2)
  })

  it('learn mode only introduces new words within the daily cap', () => {
    const cards = [cardFor('cat', State.Review, NOW - DAY, 'hard')]
    const session = buildSession(makeInput({ cards, settings: { mode: 'learn', dailyNew: 3 } }))
    expect(session).toHaveLength(3)
    expect(session.every((i) => i.kind === 'new')).toBe(true)
  })

  it('review mode never introduces new words', () => {
    const cards = [cardFor('cat', State.Review, NOW - DAY)]
    const session = buildSession(makeInput({ cards, settings: { mode: 'review' } }))
    expect(session.every((i) => i.kind !== 'new')).toBe(true)
  })

  it('respects the daily new limit with prior introductions', () => {
    const cards = [cardFor('cat', State.Review, NOW - DAY)]
    const logs = [
      { w: 'apple', s: null, at: NOW - HOUR, rating: 3 as const, q: 'self' as const, senses: [0] },
    ]
    const session = buildSession(
      makeInput({ cards, logs, settings: { mode: 'mix', dailyNew: 2, mixRatio: 1 } }),
    )
    const newWords = session.filter((i) => i.kind === 'new').map((i) => i.ref.w)
    expect(newWords).toHaveLength(1) // apple already introduced today, cap is 2
    expect(newWords).not.toContain('apple')
  })

  it('orders new words by frequency by default and alphabetically when asked', () => {
    const session = buildSession(makeInput({ settings: { mode: 'learn', dailyNew: 5 } }))
    expect(session.map((i) => i.ref.w)).toEqual(['dog', 'cat', 'apple', 'banana', 'elephant'])
    const session2 = buildSession(
      makeInput({ settings: { mode: 'learn', dailyNew: 5, newOrder: 'alphabetical' } }),
    )
    expect(session2.map((i) => i.ref.w)).toEqual(['apple', 'banana', 'cat', 'dog', 'elephant'])
  })

  it('honors the level filter (elephant is CET-6 only)', () => {
    const session = buildSession(
      makeInput({ settings: { mode: 'learn', dailyNew: 10, levelFilter: 1 } }),
    )
    expect(session.map((i) => i.ref.w)).not.toContain('elephant')
  })

  it('skips suspended cards', () => {
    const suspended = { ...cardFor('cat', State.Review, NOW - DAY), suspended: true }
    const session = buildSession(makeInput({ cards: [suspended], settings: { mode: 'review' } }))
    expect(session).toHaveLength(0)
  })

  it('tier weights bias harder cards earlier among equally-due cards', () => {
    const cards = [
      cardFor('cat', State.Review, NOW - HOUR, 'hard'),
      cardFor('dog', State.Review, NOW - HOUR, 'easy'),
    ]
    const session = buildSession(
      makeInput({
        cards,
        settings: { mode: 'review', tierWeights: { easy: 0.05, medium: 1, hard: 20 } },
      }),
    )
    // with a strong weight gap, hard cat should lead the sampled order
    expect(session[0]!.ref.w).toBe('cat')
  })
})
