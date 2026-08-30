import {
  ArkButton,
  ArkChip,
  ArkPanel,
  ArkProgress,
  ArkSection,
  IconLearn,
  IconMix,
  IconReview,
} from '@lexfield/ui'
import { useAppStore, vocab, vocabFile } from '../state/store'

const LV_LABEL = { 1: 'CET-4', 2: 'CET-6', 3: 'CET-4·6' } as const

export function TodayScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { counts, settings } = useAppStore()

  const modes = [
    {
      id: 'learn',
      code: '01 / LEARN NEW',
      title: '学习新词',
      icon: <IconLearn />,
      count: counts.newRemaining,
      desc: `按${settings.newOrder === 'frequency' ? '词频' : settings.newOrder === 'alphabetical' ? '字母序' : '词表序'}引入新词,每日上限 ${settings.dailyNew}`,
    },
    {
      id: 'review',
      code: '02 / REVIEW DUE',
      title: '复习到期',
      icon: <IconReview />,
      count: counts.due + counts.learning,
      desc: 'FSRS 到期队列 + 同日学习步骤,难词按权重更常出现',
    },
    {
      id: 'mix',
      code: '03 / MIXED OPS',
      title: '混合模式',
      icon: <IconMix />,
      count: counts.due + counts.learning + counts.newRemaining,
      desc: `到期优先,新词按 ${(settings.mixRatio * 100).toFixed(0)}% 比例插入`,
      primary: true,
    },
  ]

  const totalWords = vocabFile.n
  const goalMax = Math.max(1, settings.dailyNew * 2)
  const goalPct = Math.min(100, (counts.reviewedToday / goalMax) * 100)

  return (
    <div className="screen">
      <section className="hero ark-panel" data-tone="dark" data-accent="signal">
        <div>
          <p className="ark-panel__code">FIELD BRIEFING / 今日简报</p>
          <h2 className="hero__title">
            {counts.due + counts.learning > 0
              ? '有到期任务待执行'
              : counts.newRemaining > 0
                ? '队列为空,可引入新词'
                : '今日任务全部完成'}
          </h2>
          <div className="hero__chips">
            <ArkChip label="DUE 到期" value={counts.due + counts.learning} dark />
            <ArkChip label="NEW 可学" value={counts.newRemaining} dark />
            <ArkChip label="DONE 已评" value={counts.reviewedToday} dark />
          </div>
        </div>
        <div className="hero__meter">
          <span className="hero__pct ark-num">{Math.round(goalPct)}%</span>
          <ArkProgress value={counts.reviewedToday} max={goalMax} label="今日目标" />
          <span className="ark-eyebrow ark-eyebrow--inverse">DAILY TARGET</span>
        </div>
      </section>

      <ArkSection index="01" total="03" en="OPERATIONS" ghost="01">
        作战面板
      </ArkSection>
      <div className="modes">
        {modes.map((m) => (
          <ArkPanel
            key={m.id}
            code={m.code}
            title={
              <span className="mode-title">
                {m.title} {m.icon}
              </span>
            }
            accent={m.primary ? 'signal' : 'none'}
            status={<span>{m.desc}</span>}
            actions={
              <ArkButton
                variant={m.primary ? 'signal' : 'outline'}
                disabled={m.count === 0}
                onClick={() => onNavigate(m.id)}
              >
                {m.count === 0 ? '暂无任务' : '开始 START'}
              </ArkButton>
            }
          >
            <p className="modecount ark-num">
              {m.count}
              <small>{m.id === 'learn' ? 'READY' : 'DUE'}</small>
            </p>
          </ArkPanel>
        ))}
      </div>

      <ArkSection index="02" total="03" en="ARCHIVE STATUS" ghost="02">
        词库状态
      </ArkSection>
      <div className="statusgrid">
        <ArkPanel code="ARCHIVE / 词库总量" title={`${totalWords} 词`}>
          <p className="dimtext">
            {[1, 2, 3]
              .map((lv) => `${LV_LABEL[lv as 1 | 2 | 3]} ${[...vocab.all()].filter((e) => e.lv === lv).length}`)
              .join(' · ')}
          </p>
        </ArkPanel>
        <ArkPanel code="PROGRESS / 学习进度" title={`${counts.totalSeen} 已入列`} tone="paper">
          <p className="dimtext">
            待学 {Math.max(0, totalWords - counts.totalSeen)} · 今日新学{' '}
            {counts.newIntroducedToday}
          </p>
        </ArkPanel>
      </div>
    </div>
  )
}
