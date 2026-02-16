import type { HTMLAttributes, ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  right,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
}) {
  const cn = ['ui-card', className ?? ''].filter(Boolean).join(' ')
  return (
    <div {...props} className={cn}>
      {title || subtitle || right ? (
        <div className="ui-card__head">
          <div className="ui-card__titles">
            {title ? <div className="ui-card__title">{title}</div> : null}
            {subtitle ? <div className="ui-card__subtitle">{subtitle}</div> : null}
          </div>
          {right ? <div className="ui-card__right">{right}</div> : null}
        </div>
      ) : null}
      <div className="ui-card__body">{children}</div>
    </div>
  )
}

