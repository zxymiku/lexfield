import { ArkTierChip, ArkTip, IconAudio } from '@lexfield/ui'
import { formatSense, type Tier, type VocabEntry } from '@lexfield/core'

export function speak(word: string) {
  const synth = window.speechSynthesis
  if (!synth) return
  const u = new SpeechSynthesisUtterance(word)
  u.lang = 'en-US'
  u.rate = 0.92
  synth.cancel()
  synth.speak(u)
}

const FORM_LABEL: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  3: '三单',
  s: '复数',
  r: '比较级',
  t: '最高级',
}

export interface WordCardProps {
  entry: VocabEntry
  /** hide senses (choice/multi questions) */
  sensesHidden?: boolean
  /** restrict displayed senses to these indexes (self split) */
  senseIdxes?: number[] | null
  /** current word-level tier */
  tier?: Tier
  onTier?: (tier: Tier) => void
  /** show forms + english defs + freq details */
  detail?: boolean
  compact?: boolean
}

export function WordCard({
  entry,
  sensesHidden,
  senseIdxes,
  tier,
  onTier,
  detail = true,
  compact,
}: WordCardProps) {
  const senses =
    senseIdxes === null || senseIdxes === undefined
      ? entry.s
      : senseIdxes.map((i) => entry.s[i]).filter(Boolean)
  return (
    <div className={`wordcard${compact ? ' wordcard--compact' : ''}`}>
      <div className="wordcard__head">
        <h1 className="wordcard__word">
          {entry.w}
          <button
            type="button"
            className="wordcard__audio"
            aria-label={`朗读 ${entry.w}`}
            onClick={() => speak(entry.w)}
          >
            <IconAudio width={18} height={18} />
          </button>
        </h1>
        {entry.p ? <span className="wordcard__phonetic">{entry.p}</span> : null}
        {entry.lv !== undefined ? (
          <span className="wordcard__lv" data-lv={entry.lv}>
            {entry.lv === 1 ? 'CET-4' : entry.lv === 2 ? 'CET-6' : 'CET-4·6'}
          </span>
        ) : null}
      </div>

      {!sensesHidden && (
        <ul className="wordcard__senses">
          {senses.map((s, i) =>
            s ? (
              <li key={i}>
                {s.pos ? <em>{s.pos}</em> : null}
                {s.cn}
              </li>
            ) : null,
          )}
        </ul>
      )}

      {detail && entry.x && (
        <p className="wordcard__forms">
          {Object.entries(entry.x).map(([k, v]) => (
            <span key={k}>
              <b>{FORM_LABEL[k] ?? k}</b> {v}
            </span>
          ))}
        </p>
      )}

      {detail && entry.en && entry.en.length > 0 && (
        <details className="wordcard__en">
          <summary className="ark-eyebrow">EN DEFINITIONS</summary>
          <ul>
            {entry.en.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}

      {detail && (entry.f || entry.c) ? (
        <p className="wordcard__meta">
          {entry.f ? <span>FREQ {entry.f}</span> : null}
          {entry.b ? <span>BNC {entry.b}</span> : null}
          {entry.c ? <span>COLLINS {'★'.repeat(entry.c)}</span> : null}
        </p>
      ) : null}

      {tier && onTier ? (
        <div className="wordcard__tiers" role="group" aria-label="单词分级">
          <ArkTip label="调整整个单词的分级(影响目标记忆率与出现频率)">
            <span className="ark-eyebrow">TIER</span>
          </ArkTip>
          {(['easy', 'medium', 'hard'] as const).map((t) => (
            <ArkTierChip key={t} tier={t} active={tier === t} onClick={() => onTier(t)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export { formatSense }
