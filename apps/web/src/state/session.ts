import { useCallback, useRef, useState } from 'react'
import {
  buildSession,
  buildSensePool,
  generateQuestion,
  gradeAnswer as gradeAnswerCore,
  type Grade,
  type Mode,
  type Question,
  type QueueItem,
  type SenseIndexItem,
} from '@lexfield/core'
import { vocab, useAppStore } from './store'

export interface SessionSummary {
  total: number
  correct: number
  again: number
  elapsedMs: number
}

export interface SessionState {
  mode: Mode
  items: QueueItem[]
  index: number
  item: QueueItem | null
  question: Question | null
  /** selected option indexes for choice/multi */
  selected: number[]
  lastResult: { correct: boolean; rating: Grade } | null
  done: boolean
  summary: SessionSummary | null
}

function presentItem(
  item: QueueItem,
  settings: Parameters<typeof generateQuestion>[0]['settings'],
  pool: SenseIndexItem[],
): Question {
  return generateQuestion({
    item,
    settings,
    vocab,
    sensePool: pool,
    rng: Math.random,
  })
}

/**
 * Session player: builds the queue (core), generates questions (core),
 * applies grades to word-level AND tested-sense cards via SessionRunner.
 */
export function useSession() {
  const { storage, runner, settings, refresh } = useAppStore()
  const poolRef = useRef<SenseIndexItem[] | null>(null)
  const startedAt = useRef(0)
  const tally = useRef({ correct: 0, again: 0 })
  const [state, setState] = useState<SessionState | null>(null)

  const start = useCallback(
    async (mode: Mode) => {
      const [cards, logs] = await Promise.all([storage.allCards(), storage.allLogs()])
      const items = buildSession({ mode, settings, cards, logs, vocab, now: Date.now() })
      if (poolRef.current === null) poolRef.current = buildSensePool(vocab)
      startedAt.current = Date.now()
      tally.current = { correct: 0, again: 0 }

      if (items.length === 0) {
        setState({
          mode,
          items: [],
          index: 0,
          item: null,
          question: null,
          selected: [],
          lastResult: null,
          done: true,
          summary: { total: 0, correct: 0, again: 0, elapsedMs: 0 },
        })
        return
      }
      const first = items[0]!
      setState({
        mode,
        items,
        index: 0,
        item: first,
        question: presentItem(first, settings, poolRef.current),
        selected: [],
        lastResult: null,
        done: false,
        summary: null,
      })
    },
    [storage, settings],
  )

  const stop = useCallback(() => {
    setState(null)
  }, [])

  /** grade the current item: self rating (1-4) or selected option indexes */
  const answer = useCallback(
    async (input: { rating?: Grade; selected?: number[] }) => {
      if (!state?.item || !state.question) return
      const q = state.question
      let rating: Grade
      let sensesTested: number[]
      let correct: boolean
      if (q.type === 'self') {
        rating = input.rating ?? 3
        sensesTested = []
        correct = rating >= 3
      } else {
        const res = gradeAnswerCore(q, input.selected ?? [])
        rating = res.rating
        sensesTested = res.sensesTested
        correct = rating === 3
      }

      // word-level card always receives the rating
      await runner.grade({
        ref: { w: q.ref.w, s: null },
        rating,
        q: q.type,
        senses: sensesTested,
      })
      // tested senses get their own (lazily created) sense cards
      for (const idx of sensesTested) {
        await runner.grade({
          ref: { w: q.ref.w, s: idx },
          rating,
          q: q.type,
          senses: [idx],
        })
      }

      if (correct) tally.current.correct++
      else if (rating === 1) tally.current.again++

      setState((s) =>
        s ? { ...s, selected: input.selected ?? [], lastResult: { correct, rating } } : s,
      )
    },
    [state, runner],
  )

  const next = useCallback(async () => {
    if (!state) return
    const index = state.index + 1
    if (index >= state.items.length) {
      const summary: SessionSummary = {
        total: state.items.length,
        correct: tally.current.correct,
        again: tally.current.again,
        elapsedMs: Date.now() - startedAt.current,
      }
      setState({ ...state, done: true, summary, question: null, item: null })
      void refresh()
      return
    }
    const item = state.items[index]!
    setState({
      ...state,
      index,
      item,
      question: presentItem(item, settings, poolRef.current!),
      selected: [],
      lastResult: null,
    })
  }, [state, settings, refresh])

  return { state, start, answer, next, stop }
}
