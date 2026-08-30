import { useEffect, useState } from 'react'
import { State } from '@lexfield/core'
import { ArkPanel, ArkProgress, ArkSection } from '@lexfield/ui'
import { useAppStore } from '../state/store'

const DAY = 86_400_000

interface StatsSnapshot {
  byState: { new: number; learning: number; review: number; mature: number }
  forecast: Map<number, number>
  activity: Map<number, number>
  todayDay: number
  accuracy7: number | null
}

function useStats(): StatsSnapshot | null {
  const { storage } = useAppStore()
  const [snap, setSnap] = useState<StatsSnapshot | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [cards, logs] = await Promise.all([storage.allCards(), storage.allLogs()])
      const now = Date.now()
      const todayDay = Math.floor(now / DAY)

      const byState = { new: 0, learning: 0, review: 0, mature: 0 }
      const forecast = new Map<number, number>()
      for (const c of cards) {
        if (c.deleted || c.suspended || c.s !== null) continue
        const dueMs = c.fsrs.due instanceof Date ? c.fsrs.due.getTime() : Number(c.fsrs.due)
        if (c.fsrs.state === State.New) byState.new++
        else if (c.fsrs.state === State.Learning || c.fsrs.state === State.Relearning) byState.learning++
        else if (c.fsrs.state === State.Review) {
          if (c.fsrs.stability >= 21) byState.mature++
          else byState.review++
          const day = Math.floor(dueMs / DAY)
          if (day >= todayDay && day < todayDay + 14) {
            forecast.set(day, (forecast.get(day) ?? 0) + 1)
          }
        }
      }

      const activity = new Map<number, number>()
      let correct7 = 0
      let total7 = 0
      const weekAgo = now - 7 * DAY
      for (const l of logs) {
        const day = Math.floor(l.at / DAY)
        if (day > todayDay - 30 && day <= todayDay) {
          activity.set(day, (activity.get(day) ?? 0) + 1)
        }
        if (l.at >= weekAgo) {
          total7++
          if (l.rating >= 3) correct7++
        }
      }

      if (alive) {
        setSnap({
          byState,
          forecast,
          activity,
          todayDay,
          accuracy7: total7 > 0 ? correct7 / total7 : null,
        })
      }
    })()
    return () => {
      alive = false
    }
  }, [storage])

  return snap
}

export function StatsScreen() {
  const snap = useStats()

  return (
    <div className="screen">
      <ArkSection index="04" total="04" en="TELEMETRY" ghost="04">
        记忆遥测
      </ArkSection>

      {!snap ? (
        <ArkPanel code="TLM / LOAD" title="统计计算中…">
          <p className="dimtext">读取复习日志与卡片状态。</p>
        </ArkPanel>
      ) : (
        <>
          <div className="statusgrid">
            <ArkPanel code="STATE / 新词" title={snap.byState.new}>
              <p className="dimtext">尚未首次评分</p>
            </ArkPanel>
            <ArkPanel code="STATE / 学习中" title={snap.byState.learning} tone="paper">
              <p className="dimtext">同日学习步骤 / 重学</p>
            </ArkPanel>
            <ArkPanel code="STATE / 记忆中" title={snap.byState.review} accent="signal">
              <p className="dimtext">复习调度中(stability &lt; 21 天)</p>
            </ArkPanel>
            <ArkPanel code="STATE / 巩固" title={snap.byState.mature} accent="state">
              <p className="dimtext">stability ≥ 21 天,出现频率已显著降低</p>
            </ArkPanel>
          </div>

          <ArkSection index="A" en="14-DAY FORECAST">
            未来 14 天到期预测
          </ArkSection>
          <ArkPanel code="FORECAST / 负载" title="每日到期量(负载均衡已摊平)">
            <div className="forecast">
              {Array.from({ length: 14 }, (_, i) => {
                const day = snap.todayDay + i
                const count = snap.forecast.get(day) ?? 0
                const label =
                  i === 0
                    ? '今天'
                    : new Date(day * DAY).toLocaleDateString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })
                return (
                  <div key={day} className="forecast__row">
                    <span className="forecast__label ark-num">{label}</span>
                    <ArkProgress
                      value={count}
                      max={Math.max(5, ...[...snap.forecast.values(), 1])}
                      num={String(count)}
                      label={label}
                    />
                  </div>
                )
              })}
            </div>
          </ArkPanel>

          <ArkSection index="B" en="30-DAY ACTIVITY">
            近 30 天活跃度
          </ArkSection>
          <ArkPanel code="ACTIVITY / 热力" title="每日评分次数">
            <div className="heat" role="img" aria-label="近 30 天活跃度热力格">
              {Array.from({ length: 30 }, (_, i) => {
                const day = snap.todayDay - 29 + i
                const count = snap.activity.get(day) ?? 0
                const max = Math.max(1, ...[...snap.activity.values(), 1])
                const alpha = count === 0 ? 0.06 : 0.15 + (count / max) * 0.85
                return (
                  <span
                    key={day}
                    className="heat__cell"
                    title={`${new Date(day * DAY).toLocaleDateString('zh-CN')}: ${count} 次`}
                    style={{ background: `rgba(25,25,25,${alpha.toFixed(2)})` }}
                  />
                )
              })}
            </div>
            <p className="dimtext">
              {snap.accuracy7 !== null
                ? `近 7 天保持率(评分 ≥ 记得):${Math.round(snap.accuracy7 * 100)}%`
                : '暂无近 7 天评分记录'}
            </p>
          </ArkPanel>
        </>
      )}
    </div>
  )
}
