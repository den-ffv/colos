import { useEffect } from 'react'

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  size,
}: {
  open: boolean
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
    size?: 'default' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ui-modal__overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={`ui-modal ui-card${size === 'lg' ? ' ui-modal--lg' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        {title ? (
          <div className="ui-modal__head">
            <div className="ui-modal__title">{title}</div>
            <button type="button" className="ui-modal__x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        ) : null}
        <div className="ui-modal__body">{children}</div>
        {footer ? <div className="ui-modal__footer">{footer}</div> : null}
      </div>
    </div>
  )
}

