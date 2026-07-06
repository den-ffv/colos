import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export function Button({
  variant = 'secondary',
  size = 'md',
  left,
  right,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  left?: ReactNode
  right?: ReactNode
}) {
  const cn = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    props.disabled ? 'ui-btn--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...props} className={cn}>
      {left ? <span className="ui-btn__icon">{left}</span> : null}
      <span className="ui-btn__label">{props.children}</span>
      {right ? <span className="ui-btn__icon">{right}</span> : null}
    </button>
  )
}

