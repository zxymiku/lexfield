import type { ReactNode } from 'react'
import type { Tier } from '@lexfield/core'

export interface ArkChipProps {
  label: string
  value: ReactNode
  dark?: boolean
}

/** 36px status chip - one readable label + value line */
export function ArkChip({ label, value, dark }: ArkChipProps) {
  return (
    <span className={`ark-chip${dark ? ' ark-chip--dark' : ''}`}>
      <span className="ark-chip__label">{label}</span>
      <span className="ark-chip__value">{value}</span>
    </span>
  )
}

const TIER_LABEL: Record<Tier, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

const TIER_EN: Record<Tier, string> = {
  easy: 'EASY',
  medium: 'MID',
  hard: 'HARD',
}

/** tier marker: shape+fill encode the tier (not color alone) */
export function ArkTierChip({
  tier,
  active,
  onClick,
  title,
}: {
  tier: Tier
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  const interactive = typeof onClick === 'function'
  const Comp = interactive ? 'button' : 'span'
  const props = interactive
    ? ({ type: 'button' as const, onClick: onClick as () => void } as const)
    : {}
  return (
    <Comp
      className="ark-tier"
      data-tier={tier}
      data-active={active ? 'true' : undefined}
      title={title ?? `分级:${TIER_LABEL[tier]}`}
      {...props}
    >
      <i aria-hidden="true" />
      {TIER_LABEL[tier]} {TIER_EN[tier]}
    </Comp>
  )
}
