export interface ArkProgressProps {
  value: number
  max: number
  /** numeric readout, e.g. "3 / 20" */
  num?: string
  label?: string
}

/** calibration bar with tick marks + tabular readout */
export function ArkProgress({ value, max, num, label }: ArkProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className="ark-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <span className="ark-progress__track">
        <span className="ark-progress__fill" style={{ width: `${pct}%` }} />
      </span>
      {num ? <span className="ark-progress__num ark-num">{num}</span> : null}
    </div>
  )
}
