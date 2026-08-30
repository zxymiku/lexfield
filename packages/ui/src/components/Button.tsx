import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ArkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** signal = the one primary action on screen */
  variant?: 'outline' | 'signal' | 'ghost' | 'inverse'
  size?: 'md' | 'sm'
  wide?: boolean
  children?: ReactNode
}

export function ArkButton({
  variant = 'outline',
  size = 'md',
  wide,
  className,
  children,
  ...rest
}: ArkButtonProps) {
  const cls = [
    'ark-btn',
    variant !== 'outline' ? `ark-btn--${variant}` : '',
    size === 'sm' ? 'ark-btn--sm' : '',
    wide ? 'ark-btn--wide' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  )
}
