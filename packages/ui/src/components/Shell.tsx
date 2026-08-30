import type { CSSProperties, ReactNode } from 'react'

/** Endfield application shell: brand cell / top bar / rail / main / status strip.
 * Portrait recomposes the rail into a bottom dock - not a scaled-down desktop. */
export interface ArkNavItem {
  id: string
  /** zh label (aria + title) */
  label: string
  /** en micro label (visible) */
  en: string
  icon: ReactNode
  /** real count badge (due items etc.) - never decorative */
  badge?: number
}

export interface ArkShellProps {
  brand: string
  code: string
  nav: ArkNavItem[]
  activeId: string
  onNavigate: (id: string) => void
  /** top-right actions slot (sync state, settings…) */
  actions?: ReactNode
  /** online/verified state chip - data must be truthful */
  online?: boolean
  onlineLabel?: string
  /** bottom status strip entries (real data: date, due, new, version…) */
  statusItems?: Array<{ label: string; value: string; strong?: boolean }>
  /** visual depth axis - defaults to maximal per the design contract */
  depth?: 'minimal' | 'moderate' | 'complex' | 'maximal'
  children: ReactNode
}

export function ArkShell({
  brand,
  code,
  nav,
  activeId,
  onNavigate,
  actions,
  online = false,
  onlineLabel = 'OFFLINE',
  statusItems = [],
  depth = 'maximal',
  children,
}: ArkShellProps) {
  return (
    <div className="ark-shell" data-ark-theme="endfield" data-ark-depth={depth}>
      <div className="ark-brandcell" aria-hidden="true">
        <span className="ark-brandmark" />
        <span className="ark-brandcell__name">{brand}</span>
      </div>

      <header className="ark-topbar">
        <div className="ark-topbar__title">
          <strong>{brand}</strong>
          <small>{code}</small>
        </div>
        <div className="ark-topbar__actions">{actions}</div>
        <span className="ark-online" data-state={online ? 'online' : 'offline'}>
          <i aria-hidden="true" /> {onlineLabel}
        </span>
      </header>

      <nav className="ark-rail" aria-label="主导航">
        {nav.map((item) => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              className={`ark-rail__item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}
              <small>{item.en}</small>
              {item.badge ? <span className="ark-rail__badge">{item.badge}</span> : null}
            </button>
          )
        })}
      </nav>

      <main className="ark-main">{children}</main>

      <footer className="ark-statusbar">
        {statusItems.map((item) => (
          <span key={item.label} className="ark-statusbar__item">
            {item.label}
            <strong className={item.strong === false ? undefined : 'ark-num'}>{item.value}</strong>
          </span>
        ))}
        <span className="ark-statusbar__fill" aria-hidden="true" />
        <span className="ark-statusbar__item">LEXFIELD</span>
      </footer>
    </div>
  )
}

/** page content wrapper: stage layers + choreography stagger index */
export function ArkPage({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="ark-stage anim-wipe" style={style}>
      <div className="ark-edge-scale" aria-hidden="true" />
      <div className="ark-sector" aria-hidden="true" />
      {children}
    </div>
  )
}
