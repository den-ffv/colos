import { useEffect } from 'react'

export function Drawer({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 460,
}: {
  open: boolean
  title?: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer__overlay${open ? ' drawer__overlay--visible' : ''}`}
        onMouseDown={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`drawer${open ? ' drawer--open' : ''}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer__header">
          <div className="drawer__headerText">
            {title && <div className="drawer__title">{title}</div>}
            {subtitle && <div className="drawer__subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="drawer__body">
          {children}
        </div>

        {footer && (
          <div className="drawer__footer">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
