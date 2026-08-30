import type { ReactNode } from 'react'

export interface ArkPanelProps {
  /** mono code line, e.g. "REC / 0412" */
  code?: string
  title?: ReactNode
  /** dark charcoal (default) or paper */
  tone?: 'dark' | 'paper'
  /** left edge accent: signal (action) / state (verified) */
  accent?: 'signal' | 'state' | 'none'
  status?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function ArkPanel({
  code,
  title,
  tone = 'dark',
  accent = 'none',
  status,
  actions,
  className,
  children,
}: ArkPanelProps) {
  return (
    <article
      className={`ark-panel${className ? ` ${className}` : ''}`}
      data-tone={tone === 'paper' ? 'paper' : 'dark'}
      data-accent={accent === 'none' ? undefined : accent}
    >
      {code ? <p className="ark-panel__code">{code}</p> : null}
      {title ? <h3 className="ark-panel__title">{title}</h3> : null}
      <div className="ark-panel__body">{children}</div>
      {actions ? <div className="ark-panel__actions">{actions}</div> : null}
      {status ? <div className="ark-panel__status">{status}</div> : null}
    </article>
  )
}

export interface ArkSectionProps {
  /** two-digit section index, e.g. "01" */
  index?: string
  /** total, e.g. "06" - renders as NN / NN */
  total?: string
  /** en micro caption */
  en?: string
  /** ghost numeral behind the header (depth-gated) */
  ghost?: string
  children: ReactNode
}

export function ArkSection({ index, total, en, ghost, children }: ArkSectionProps) {
  return (
    <header style={{ position: 'relative' }}>
      {ghost ? (
        <span className="ark-ghost-num" aria-hidden="true">
          {ghost}
        </span>
      ) : null}
      <div className="ark-section">
        {index ? (
          <span className="ark-section__index ark-num">
            {index}
            {total ? ` / ${total}` : ''}
          </span>
        ) : null}
        <h2 className="ark-section__title">{children}</h2>
        <span className="ark-section__rule" aria-hidden="true" />
        {en ? <span className="ark-section__en">{en}</span> : null}
      </div>
    </header>
  )
}

export function ArkEyebrow({ inverse, children }: { inverse?: boolean; children: ReactNode }) {
  return <p className={`ark-eyebrow${inverse ? ' ark-eyebrow--inverse' : ''}`}>{children}</p>
}
