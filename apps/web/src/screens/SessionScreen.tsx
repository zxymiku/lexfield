import { useEffect } from 'react'
import { ArkButton, ArkChip, ArkPanel, ArkProgress, ArkSection } from '@lexfield/ui'
import type { Mode } from '@lexfield/core'
import { useAppStore } from '../state/store'
import { useSession } from '../state/session'
import { WordCard } from '../components/WordCard'
import { QuestionCard } from '../components/QuestionCard'

const MODE_META: Record<Mode, { code: string; title: string }> = {
  learn: { code: 'OP / LEARN', title: '学习新词' },
  review: { code: 'OP / REVIEW', title: '复习到期' },
  mix: { code: 'OP / MIXED', title: '混合模式' },
}

export function SessionScreen({ mode, onExit }: { mode: Mode; onExit: () => void }) {
  const { settings } = useAppStore()
  const { state, start, answer, next, stop } = useSession()

  useEffect(() => {
    void start(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (!state) {
    return (
      <div className="screen">
        <ArkPanel code="OP / STANDBY" title="正在集结队列…">
          <p className="dimtext">读取调度状态,构建本次会话队列。</p>
        </ArkPanel>
      </div>
    )
  }

  if (state.done) {
    const s = state.summary
    return (
      <div className="screen">
        <ArkSection index="✓" en="MISSION COMPLETE">
          会话完成
        </ArkSection>
        <ArkPanel
          code={MODE_META[mode].code}
          title={s && s.total > 0 ? '本组战果' : '本次无任务'}
          accent={s && s.correct > 0 ? 'state' : 'none'}
          status={
            s && s.total > 0 ? (
              <>
                <span>用时 {Math.round(s.elapsedMs / 1000)}s</span>
                <span>答对 {s.correct}</span>
                <span>忘记 {s.again}</span>
              </>
            ) : undefined
          }
        >
          {s && s.total > 0 ? (
            <>
              <p className="modecount ark-num">
                {s.correct}
                <small>/{s.total} CORRECT</small>
              </p>
              <p className="dimtext">
                FSRS 已根据本轮表现更新所有触及单词与义项的调度;答错的词会更快再次出现。
              </p>
            </>
          ) : (
            <p className="dimtext">
              {mode === 'learn'
                ? '今日新词额度已用完,或没有符合筛选的未学词。可在设置中调整。'
                : '当前没有到期任务。新词可以先学,或明天再来。'}
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <ArkButton variant="signal" onClick={onExit}>
              返回今天 BACK
            </ArkButton>
          </div>
        </ArkPanel>
      </div>
    )
  }

  const { item, question, lastResult } = state
  const total = state.items.length
  const meta = MODE_META[state.mode]

  return (
    <div className="screen session">
      <div className="session__head">
        <span className="ark-panel__code">
          {meta.code} · {meta.title}
        </span>
        <ArkProgress value={state.index} max={total} num={`${state.index + 1} / ${total}`} label="会话进度" />
        <ArkButton
          size="sm"
          variant="ghost"
          onClick={() => {
            stop()
            onExit()
          }}
        >
          退出 EXIT
        </ArkButton>
      </div>

      {item && question ? (
        <div className="session__stage">
          <div className="session__word" key={item.ref.w}>
            <WordCard
              entry={item.entry}
              sensesHidden={question.type !== 'self'}
              senseIdxes={question.type === 'self' ? question.senseIdxes : null}
              detail={question.type === 'self'}
              compact={question.type !== 'self'}
            />
          </div>
          <div className="session__q">
            <QuestionCard
              question={question}
              lastResult={lastResult}
              onSelfRating={(rating) => void answer({ rating })}
              onSubmitSelection={(selected) => void answer({ selected })}
              onNext={() => void next()}
            />
          </div>
        </div>
      ) : null}

      <div className="session__foot">
        <ArkChip label="MODE" value={meta.title} dark />
        <ArkChip
          label="RETENTION"
          value={`${Math.round(settings.baseRetention * 100)}%`}
          dark
        />
      </div>
    </div>
  )
}
