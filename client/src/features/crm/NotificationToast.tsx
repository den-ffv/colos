import { useEffect } from 'react'

type NotifItem = {
  id: string
  title: string
  body: string
  orderId: string | null
}

type Props = {
  toasts: NotifItem[]
  onDismiss: (id: string) => void
  onNavigate: (orderId: string | null) => void
}

export function NotificationToast({ toasts, onDismiss, onNavigate }: Props) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
  onNavigate,
}: {
  toast: NotifItem
  onDismiss: (id: string) => void
  onNavigate: (orderId: string | null) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      style={{
        background: '#1e293b', color: '#f8fafc',
        borderRadius: 8, padding: '12px 16px',
        minWidth: 280, maxWidth: 360,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        cursor: toast.orderId ? 'pointer' : 'default',
        animation: 'slideInRight 0.2s ease',
      }}
      onClick={() => { onNavigate(toast.orderId); onDismiss(toast.id); }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{toast.title}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{toast.body}</div>
    </div>
  )
}
