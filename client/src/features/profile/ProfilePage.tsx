import { useEffect, useState } from 'react'
import { apiGetJson, apiPatchJson } from '../../lib/api'
import type { ApiResponse } from '../../lib/apiResponse'
import type { AuthTokens } from '../auth/auth.storage'

type AuthHeaders = { Authorization: string }

const ALL_EVENT_TYPES = [
  { type: 'ORDER_CREATED',       label: 'Новий договір створено',       hasEmail: true  },
  { type: 'DRIVER_ASSIGNED',     label: 'Водій призначений на договір', hasEmail: true  },
  { type: 'DRIVER_ACCEPTED',     label: 'Водій прийняв договір',        hasEmail: false },
  { type: 'PREPAYMENT_RECEIVED', label: 'Аванс отримано',               hasEmail: false },
  { type: 'ORDER_COMPLETED',     label: 'Договір завершено',            hasEmail: false },
] as const

type EventType = typeof ALL_EVENT_TYPES[number]['type']
type PrefMap = Record<EventType, { emailEnabled: boolean; inAppEnabled: boolean }>

function defaultPrefs(): PrefMap {
  return Object.fromEntries(
    ALL_EVENT_TYPES.map((e) => [e.type, { emailEnabled: true, inAppEnabled: true }])
  ) as PrefMap
}

type Props = { tokens: AuthTokens }

export function ProfilePage({ tokens }: Props) {
  const authHeaders: AuthHeaders = { Authorization: `Bearer ${tokens.accessToken}` }

  /* ── password change ──────────────────────────────────── */
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [pwError,    setPwError]    = useState<string | null>(null)
  const [pwSuccess,  setPwSuccess]  = useState(false)
  const [pwSaving,   setPwSaving]   = useState(false)

  async function changePassword() {
    setPwError(null)
    setPwSuccess(false)
    if (newPw.length < 8) { setPwError('Новий пароль — мінімум 8 символів'); return }
    if (newPw !== confirmPw) { setPwError('Паролі не збігаються'); return }
    setPwSaving(true)
    try {
      type Resp = ApiResponse<{ success: boolean }>
      const res = await apiPatchJson<Resp>('/api/auth/password',
        { currentPassword: currentPw, newPassword: newPw },
        { headers: authHeaders },
      )
      if (res && 'success' in res && res.success) {
        setPwSuccess(true)
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
      } else {
        setPwError((res as { message?: string }).message ?? 'Помилка')
      }
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setPwSaving(false)
    }
  }

  /* ── notification preferences ─────────────────────────── */
  const [prefs, setPrefs]       = useState<PrefMap>(defaultPrefs())
  const [prefLoaded, setPrefLoaded] = useState(false)

  useEffect(() => {
    type PrefRow = { eventType: EventType; emailEnabled: boolean; inAppEnabled: boolean }
    apiGetJson<ApiResponse<PrefRow[]>>('/api/notifications/preferences', { headers: authHeaders })
      .then((res) => {
        if (res && 'success' in res && res.success) {
          const merged = defaultPrefs()
          for (const row of (res as { success: true; data: PrefRow[] }).data) {
            if (row.eventType in merged) {
              merged[row.eventType] = { emailEnabled: row.emailEnabled, inAppEnabled: row.inAppEnabled }
            }
          }
          setPrefs(merged)
        }
        setPrefLoaded(true)
      })
      .catch(() => setPrefLoaded(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePref(type: EventType, channel: 'emailEnabled' | 'inAppEnabled', value: boolean) {
    const prev = prefs[type]
    setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: value } }))
    apiPatchJson('/api/notifications/preferences', {
      eventType: type,
      emailEnabled: channel === 'emailEnabled' ? value : prev.emailEnabled,
      inAppEnabled: channel === 'inAppEnabled' ? value : prev.inAppEnabled,
    }, { headers: authHeaders }).catch(() => {
      setPrefs((p) => ({ ...p, [type]: prev }))
    })
  }

  /* ── render ──────────────────────────────────────────��─── */
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 32 }}>Профіль</h2>

      <section style={{ marginBottom: 40 }}>
        <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Змінити пароль</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <input
            type="password" placeholder="Поточний пароль"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
            className="co__input"
          />
          <input
            type="password" placeholder="Новий пароль (мін. 8 символів)"
            value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwError(null) }}
            className="co__input"
          />
          <input
            type="password" placeholder="Підтвердіть новий пароль"
            value={confirmPw} onChange={(e) => { setConfirmPw(e.target.value); setPwError(null) }}
            className="co__input"
          />
          {pwError && <span style={{ color: '#ef4444', fontSize: 13 }}>{pwError}</span>}
          {pwSuccess && <span style={{ color: '#16a34a', fontSize: 13 }}>Пароль змінено</span>}
          <button
            type="button"
            className="co__input"
            style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            onClick={() => void changePassword()}
          >
            {pwSaving ? 'Збереження…' : 'Змінити пароль'}
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Налаштування сповіщень</h3>
        {!prefLoaded ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Завантаження…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748b', fontWeight: 500 }}>Подія</th>
                <th style={{ padding: '8px 16px', color: '#64748b', fontWeight: 500 }}>In-app</th>
                <th style={{ padding: '8px 16px', color: '#64748b', fontWeight: 500 }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {ALL_EVENT_TYPES.map((evt) => (
                <tr key={evt.type} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#1e293b' }}>{evt.label}</td>
                  <td style={{ textAlign: 'center', padding: '10px 16px' }}>
                    <input
                      type="checkbox"
                      checked={prefs[evt.type].inAppEnabled}
                      onChange={(e) => togglePref(evt.type, 'inAppEnabled', e.target.checked)}
                    />
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 16px' }}>
                    {evt.hasEmail ? (
                      <input
                        type="checkbox"
                        checked={prefs[evt.type].emailEnabled}
                        onChange={(e) => togglePref(evt.type, 'emailEnabled', e.target.checked)}
                      />
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
