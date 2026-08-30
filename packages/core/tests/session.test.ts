import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { InMemoryStorage, computeDueHistogram } from '../src/storage'
import { balanceDay, SessionRunner } from '../src/session'
import { JsonVocab } from '../src/vocab'
import { newCard } from '../src/fsrs'
import { DEFAULT_SETTINGS, type CardRecord, type VocabFile } from '../src/types'
import { exportData, importData, type ExportPayload } from '../src/transfer'

const DAY = 86_400_000
const NOW = 1_750_000_000_000

const VOCAB: VocabFile = {
  v: 1,
  n: 3,
  words: [
    { w: 'apple', lv: 1, s: [{ pos: 'n.', cn: '苹果' }, { pos: 'n.', cn: '苹果树' }], f: 1200 },
    { w: 'cat', lv: 1, s: [{ pos: 'n.', cn: '猫' }], f: 900 },
    { w: 'dog', lv: 1, s: [{ pos: 'n.', cn: '狗' }], f: 800 },
  ],
}

function cardFixture(w: string, state: State, due: number, tier: CardRecord['tier'] = 'medium'): CardRecord {
  return {
    w,
    s: null,
    fsrs: { ...newCard(NOW), state, due: new Date(due), stability: 3, difficulty: 5, reps: 2, lapses: 0 },
    tier,
    suspended: false,
    updatedAt: 100,
  }
}

describe('balanceDay / computeDueHistogram', () => {
  it('moves a due day to the lightest neighbor, never into the past', () => {
    const hist = new Map<number, number>([
      [100, 5],
      [101, 0],
      [102, 5],
    ])
    expect(balanceDay(100, hist, 100)).toBe(101)
    expect(balanceDay(102, hist, 100)).toBe(101)
  })

  it('keeps the day when neighbors are equally loaded', () => {
    expect(balanceDay(50, new Map(), 50)).toBe(50)
  })

  it('counts only review-state cards', () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    storage.cards.set('w:cat', cardFixture('cat', State.Review, NOW + 3 * DAY))
    storage.cards.set('w:dog', cardFixture('dog', State.Learning, NOW + 3 * DAY))
    const hist = computeDueHistogram([...storage.cards.values()], NOW, 60)
    expect(hist.get(Math.floor((NOW + 3 * DAY) / DAY))).toBe(1)
  })
})

describe('SessionRunner', () => {
  it('creates the word-level card on first grade and logs the review', async () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    const runner = new SessionRunner(storage, new JsonVocab(VOCAB), DEFAULT_SETTINGS, NOW)
    await runner.ensureWordCard('apple')
    const out = await runner.grade({ ref: { w: 'apple', s: null }, rating: 3, q: 'self', senses: [0] })
    expect(out.card.fsrs.reps).toBe(1)
    expect(out.card.fsrs.state).toBe(State.Learning)
    const logs = await storage.allLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ w: 'apple', s: null, rating: 3, q: 'self', senses: [0] })
  })

  it('setWordTier updates every card of the word (word + senses)', async () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    const runner = new SessionRunner(storage, new JsonVocab(VOCAB), DEFAULT_SETTINGS, NOW)
    await runner.ensureWordCard('apple')
    await runner.grade({ ref: { w: 'apple', s: 1 }, rating: 3, q: 'choice', senses: [1] })
    await runner.setWordTier('apple', 'hard')
    for (const c of await storage.allCards()) {
      if (c.w === 'apple') expect(c.tier).toBe('hard')
    }
  })

  it('reset returns the card to fresh state', async () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    const runner = new SessionRunner(storage, new JsonVocab(VOCAB), DEFAULT_SETTINGS, NOW)
    await runner.ensureWordCard('cat')
    await runner.grade({ ref: { w: 'cat', s: null }, rating: 4, q: 'self', senses: [0] })
    await runner.reset({ w: 'cat', s: null })
    const card = (await storage.allCards()).find((c) => c.w === 'cat')!
    expect(card.fsrs.state).toBe(State.New)
    expect(card.fsrs.reps).toBe(0)
  })
})

describe('export/import', () => {
  it('merges by updatedAt (last write wins)', async () => {
    const local = new InMemoryStorage(DEFAULT_SETTINGS)
    await local.putCard(cardFixture('apple', State.Review, NOW))
    const incoming = cardFixture('apple', State.Review, NOW + DAY)
    incoming.fsrs.stability = 9
    incoming.updatedAt = 200
    const remote = new InMemoryStorage(DEFAULT_SETTINGS)
    await remote.putCard(incoming)
    await remote.putCard(cardFixture('dog', State.New, NOW, 'easy'))
    const remotePayload = await exportData(remote)
    const res = await importData(local, remotePayload, { mode: 'merge' })
    expect(res.cards).toBe(2)
    const apple = (await local.allCards()).find((c) => c.w === 'apple')!
    expect(apple.fsrs.stability).toBe(9) // incoming newer
    expect((await local.allCards()).find((c) => c.w === 'dog')).toBeTruthy()
  })

  it('replace mode tombstones existing cards', async () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    await storage.putCard(cardFixture('cat', State.Review, NOW))
    const payload = await exportData(storage)
    payload.cards = []
    await importData(storage, payload, { mode: 'replace' })
    const cat = (await storage.allCards()).find((c) => c.w === 'cat')!
    expect(cat.deleted).toBe(true)
  })

  it('rejects foreign payloads', async () => {
    const storage = new InMemoryStorage(DEFAULT_SETTINGS)
    const payload = (await exportData(storage)) as ExportPayload
    const foreign = { ...payload, app: 'other', version: 99 } as unknown as ExportPayload
    await expect(importData(storage, foreign, { mode: 'merge' })).rejects.toThrow('unsupported')
  })
})
