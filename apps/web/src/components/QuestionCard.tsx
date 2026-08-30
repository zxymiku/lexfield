import { useEffect, useState } from 'react'
import { ArkButton, IconCheck, IconClose, IconEye } from '@lexfield/ui'
import { formatSense, type Grade, type Question } from '@lexfield/core'
import { speak } from './WordCard'

const GRADES: Array<{ rating: Grade; zh: string; en: string; hint: string }> = [
  { rating: 1, zh: '忘记', en: 'AGAIN', hint: '完全想不起来,尽快再见' },
  { rating: 2, zh: '困难', en: 'HARD', hint: '想起来了,但很吃力' },
  { rating: 3, zh: '记得', en: 'GOOD', hint: '正常回忆起来' },
  { rating: 4, zh: '简单', en: 'EASY', hint: '毫不费力,拉长间隔' },
]

export interface QuestionCardProps {
  question: Question
  /** feedback result (choice/multi answered or self rated) */
  lastResult: { correct: boolean; rating: Grade } | null
  onSelfRating: (rating: Grade) => void
  onSubmitSelection: (selected: number[]) => void
  onNext: () => void
}

export function QuestionCard({
  question,
  lastResult,
  onSelfRating,
  onSubmitSelection,
  onNext,
}: QuestionCardProps) {
  const [selected, setSelected] = useState<number[]>([])
  const [revealed, setRevealed] = useState(question.type !== 'self')

  useEffect(() => {
    setSelected([])
    setRevealed(question.type !== 'self')
  }, [question])

  // keyboard: 1-4 grades for self questions
  useEffect(() => {
    if (question.type !== 'self' || lastResult) return
    const onKey = (e: KeyboardEvent) => {
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      if (idx >= 0) onSelfRating((idx + 1) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, lastResult, onSelfRating])

  /* ---------------- self ---------------- */
  if (question.type === 'self') {
    return (
      <div className="qcard">
        {!revealed ? (
          <div className="qcard__reveal">
            <ArkButton variant="signal" onClick={() => setRevealed(true)}>
              <IconEye width={16} height={16} /> 显示释义 REVEAL
            </ArkButton>
            <span className="ark-eyebrow">回想词义,再对照评分 · SPACE 也可显示</span>
          </div>
        ) : (
          <ul className="qcard__senses">
            {question.senses.map((s, i) => (
              <li key={i}>
                {s.pos ? <em>{s.pos}</em> : null}
                {s.cn}
              </li>
            ))}
          </ul>
        )}

        {!lastResult ? (
          <div className="gradebar" role="group" aria-label="记忆评分">
            {GRADES.map((g) => (
              <ArkButton
                key={g.rating}
                data-rating={g.rating}
                title={g.hint}
                onClick={() => onSelfRating(g.rating)}
              >
                <kbd>{g.rating}</kbd>
                {g.zh}
                <small>{g.en}</small>
              </ArkButton>
            ))}
          </div>
        ) : (
          <FeedbackRow result={lastResult} onNext={onNext} />
        )}
      </div>
    )
  }

  /* ---------------- choice / multi ---------------- */
  const multi = question.type === 'multi'
  const correctIdxes = question.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0)
  const answered = lastResult !== null

  const toggle = (i: number) => {
    if (answered) return
    speakIfTarget(question, i)
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
  }

  return (
    <div className="qcard">
      <p className="qcard__prompt">
        {multi ? `选出「${question.entry.w}」的全部正确释义` : `选出「${question.entry.w}」的正确释义`}
        <span className="ark-eyebrow">{multi ? 'MULTI SELECT' : 'SINGLE SELECT'}</span>
      </p>
      <div className={multi ? 'optgrid optgrid--multi' : 'optgrid'} role={multi ? 'group' : 'radiogroup'} aria-label="释义选项">
        {question.options.map((o, i) => {
          const isSel = selected.includes(i)
          const isCorrect = o.correct
          const showTruth = answered
          const cls = [
            'opt',
            multi && isSel ? 'is-selected' : '',
            showTruth && isCorrect ? 'is-correct' : '',
            showTruth && isSel && !isCorrect ? 'is-wrong' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={answered && !multi}
              onClick={() => (multi ? toggle(i) : submitOne(i))}
              aria-pressed={multi ? isSel : undefined}
            >
              <span className="opt__key">{String.fromCharCode(65 + i)}</span>
              <span className="opt__text">{o.text}</span>
              {showTruth && isCorrect ? <IconCheck width={14} height={14} /> : null}
              {showTruth && isSel && !isCorrect ? <IconClose width={14} height={14} /> : null}
            </button>
          )
        })}
      </div>

      {!answered ? (
        multi ? (
          <ArkButton
            variant="signal"
            disabled={selected.length === 0}
            onClick={() => onSubmitSelection(selected)}
          >
            提交 SUBMIT
          </ArkButton>
        ) : (
          <span className="ark-eyebrow">选择一个释义</span>
        )
      ) : (
        <FeedbackRow result={lastResult!} onNext={onNext} />
      )}
    </div>
  )

  function submitOne(i: number) {
    if (answered) return
    speakIfTarget(question, i)
    onSubmitSelection([i])
  }
}

function speakIfTarget(q: Question, _i: number) {
  speak(q.entry.w)
}

function FeedbackRow({
  result,
  onNext,
}: {
  result: { correct: boolean; rating: Grade }
  onNext: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext])

  return (
    <div className={`feedback ${result.correct ? 'feedback--ok' : 'feedback--miss'} ${result.correct ? 'ark-flash' : ''}`}>
      <strong>{result.correct ? '正确 · VERIFIED' : '未通过 · REQUEUED'}</strong>
      <span>
        {result.correct
          ? '已按 FSRS 调度,下次出现间隔将变长'
          : result.rating === 2
            ? '部分正确,间隔小幅推进,该义项会更频繁出现'
            : '已重排进队列,很快会再次出现'}
      </span>
      <ArkButton variant="signal" onClick={onNext}>
        继续 CONTINUE <kbd>Enter</kbd>
      </ArkButton>
    </div>
  )
}

export { formatSense }
