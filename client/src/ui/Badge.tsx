import type { HTMLAttributes } from 'react'

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const cn = ['ui-badge', `ui-badge--${variant}`, className ?? ''].filter(Boolean).join(' ')
  return <span {...props} className={cn} />
}

