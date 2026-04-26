import { useEffect, useRef } from 'react'

type NotifItem = {
  id: string
  type: string
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}

type Props = {
  notifications: NotifItem[]
  onMarkAllRead: () => void
  onClose: () => void
  onNavigate: (orderId: string | null) => void
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'щойно'
  if (mins < 60) return `${mins} хв тому`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} год тому`
  return `${Math.floor(hrs / 24)} дн тому`
}

export function NotificationDropdown({ notifications, onMarkAllRead, onClose, onNavigate }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: '100%', right: 0, zIndex: 1000,
        width: 360, maxHeight: 480, overflowY: 'auto',
        background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        marginTop: 4,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Сповіщення</span>
        <button
          type="button"
          onClick={onMarkAllRead}
          style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}
        >
          Позначити всі прочитаними
        </button>
      </div>

      {notifications.length === 0 && (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Немає сповіщень
        </div>
      )}

      {notifications.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onNavigate(n.orderId)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '12px 16px', background: n.isRead ? '#fff' : '#eff6ff',
            border: 'none', borderBottom: '1px solid #f1f5f9',
            cursor: n.orderId ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>
            {n.title}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{n.body}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(n.createdAt)}</div>
        </button>
      ))}
    </div>
  )
}
