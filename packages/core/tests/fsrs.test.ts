import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { deserializeCard, dueMs, gradeCard, newCard, retentionForTier, retrievability } from '../src/fsrs'
import { DEFAULT_SETTINGS, type Settings } from '../src/types'

const MIN = 60_000
const DAY = 86_400_000
const NOW = 1_750_000_000_000

describe('fsrs wrapper', () => {
  it('grades a new card into short-term learning', () => {
    const card = newCard(NOW)
    expect(card.state).toBe(State.New)
    const { card: next } = gradeCard(card, 3, 0.9, NOW) // Good
    expect(next.state).toBe(State.Learning)
    expect(dueMs(next)).toBeGreaterThan(NOW)
    expect(dueMs(next) - NOW).toBeLessThanOrEqual(15 * MIN) // intraday step
    expect(next.stability).toBeGreaterThan(0)
  })

  it('repeating Good graduates the card to Review with a day-level interval', () => {
    let card = newCard(NOW)
    card = gradeCard(card, 3, 0.9, NOW).card
    const out2 = gradeCard(card, 3, 0.9, NOW + 10 * MIN)
    expect(out2.card.state).toBe(State.Review)
    expect(out2.card.scheduled_days).toBeGreaterThanOrEqual(1)
    expect(dueMs(out2.card) - (NOW + 10 * MIN)).toBeGreaterThan(DAY / 2)
  })

  it('sends a lapsed review card into Relearning (higher frequency again)', () => {
    let card = newCard(NOW)
    card = gradeCard(card, 3, 0.9, NOW).card
    card = gradeCard(card, 3, 0.9, NOW + 10 * MIN).card
    const lapsed = gradeCard(card, 1, 0.9, NOW + 10 * DAY).card
    expect(lapsed.state).toBe(State.Relearning)
    expect(dueMs(lapsed) - (NOW + 10 * DAY)).toBeLessThanOrEqual(15 * MIN)
  })

  it('correct answers push the next appearance further away', () => {
    let card = newCard(NOW)
    card = gradeCard(card, 3, 0.9, NOW).card
    card = gradeCard(card, 3, 0.9, NOW + 10 * MIN).card
    const days1 = (dueMs(card) - (NOW + 10 * MIN)) / DAY
    const again = gradeCard(card, 3, 0.9, NOW + 10 * DAY).card
    const days2 = (dueMs(again) - (NOW + 10 * DAY)) / DAY
    expect(days2).toBeGreaterThan(days1 * 1.5)
  })

  it('maps tiers to retention: hard > medium > easy, clamped', () => {
    const s: Settings = { ...DEFAULT_SETTINGS }
    expect(retentionForTier(s, 'hard')).toBeGreaterThan(retentionForTier(s, 'medium'))
    expect(retentionForTier(s, 'medium')).toBeGreaterThan(retentionForTier(s, 'easy'))
    const extreme: Settings = { ...s, baseRetention: 0.99, tierRetentionDelta: 0.2 }
    expect(retentionForTier(extreme, 'hard')).toBeLessThanOrEqual(0.97)
    expect(retentionForTier(extreme, 'easy')).toBeGreaterThanOrEqual(0.8)
  })

  it('harder retention produces shorter intervals', () => {
    const base = newCard(NOW)
    const easy = gradeCard(base, 3, retentionForTier(DEFAULT_SETTINGS, 'easy'), NOW).card
    const hard = gradeCard(base, 3, retentionForTier(DEFAULT_SETTINGS, 'hard'), NOW).card
    // graduate both through the second step
    const easyR = gradeCard(easy, 3, retentionForTier(DEFAULT_SETTINGS, 'easy'), NOW + 10 * MIN).card
    const hardR = gradeCard(hard, 3, retentionForTier(DEFAULT_SETTINGS, 'hard'), NOW + 10 * MIN).card
    expect(dueMs(hardR)).toBeLessThan(dueMs(easyR))
  })

  it('retrievability rises toward 1 right after a review and decays over time', () => {
    let card = newCard(NOW)
    card = gradeCard(card, 3, 0.9, NOW).card
    card = gradeCard(card, 3, 0.9, NOW + 10 * MIN).card
    const fresh = retrievability(card, 0.9, NOW + 10 * MIN + 1_000)
    const later = retrievability(card, 0.9, NOW + 10 * MIN + 5 * DAY)
    expect(fresh).toBeGreaterThan(0.8)
    expect(later).toBeLessThan(fresh)
  })

  it('serializes round-trip (Date -> ISO string -> Date)', () => {
    let card = newCard(NOW)
    card = gradeCard(card, 3, 0.9, NOW).card
    const json = JSON.parse(JSON.stringify(card))
    expect(typeof json.due).toBe('string')
    const revived = deserializeCard(json)
    expect(revived.due).toBeInstanceOf(Date)
    expect(dueMs(revived)).toBe(dueMs(card))
  })
})
