import { useEffect, useMemo, useState } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiGetJson, apiPatchJson, apiPostJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'
import { Card } from '../../ui/Card'
import './driver-portal.css'

/* ─── types ─────────────────────────────────────────────── */

type OrderStatus =
  | 'NEW' | 'CONFIRMED' | 'DRIVER_ACCEPTED'
  | 'AWAITING_PREPAYMENT' | 'PREPAID'
  | 'IN_TRANSIT' | 'DELIVERED'
  | 'AWAITING_FINAL_PAYMENT' | 'COMPLETED' | 'CANCELLED'

type MyOrder = {
  id: string
  orderNumber: string
  status: OrderStatus
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  productType?: string
  weight?: number
  notes?: string
  client: { id: string; companyName: string; contactPerson: string; phone: string } | null
  vehicle?: { plateNumber: string; type: string }
  createdAt: string
  updatedAt: string
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

/* ─── helpers ────────────────────────────────────────────── */

function isListSuccess<T>(res: ApiListResponse<T>): res is { success: true; data: T[]; pagination: Pagination } {
  return !!res && 'success' in res && (res as { success: unknown }).success === true
}

function isSuccess<T>(res: ApiResponse<T>): res is { success: true; data: T } {
  return !!res && 'success' in res && (res as { success: unknown }).success === true
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW:                    'Нове',
  CONFIRMED:              'Підтверджено',
  DRIVER_ACCEPTED:        'Прийнято',
  AWAITING_PREPAYMENT:    'Очікує авансу',
  PREPAID:                'Аванс оплачено',
  IN_TRANSIT:             'В дорозі',
  DELIVERED:              'Доставлено',
  AWAITING_FINAL_PAYMENT: 'Очікує доплати',
  COMPLETED:              'Завершено',
  CANCELLED:              'Скасовано',
}

const STATUS_BADGE: Record<OrderStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  NEW:                    'neutral',
  CONFIRMED:              'warning',
  DRIVER_ACCEPTED:        'neutral',
  AWAITING_PREPAYMENT:    'warning',
  PREPAID:                'warning',
  IN_TRANSIT:             'warning',
  DELIVERED:              'success',
  AWAITING_FINAL_PAYMENT: 'warning',
  COMPLETED:              'success',
  CANCELLED:              'danger',
}

/** Статус → кнопка дії для водія */
const DRIVER_ACTION: Partial<Record<OrderStatus, { label: string; next?: OrderStatus; accept?: boolean }>> = {
  CONFIRMED:  { label: '✅ Прийняти договір', accept: true },
  PREPAID:    { label: '🚚 Розпочати доставку', next: 'IN_TRANSIT' },
  IN_TRANSIT: { label: '📦 Позначити як доставлено', next: 'DELIVERED' },
}

/* ─── component ─────────────────────────────────────────── */

export function DriverPortal({ tokens, onUnauthorized }: { tokens: AuthTokens; onUnauthorized: () => void }) {
  const [data, setData]               = useState<MyOrder[]>([])
  const [pagination, setPagination]   = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [page, setPage]               = useState(1)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const selected = useMemo(() => data.find((o) => o.id === selectedId) ?? null, [data, selectedId])

  async function loadOrders() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<MyOrder>>(
        `/api/orders/my?page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      )
      if (isListSuccess(res)) {
        setData(res.data)
        setPagination(res.pagination)
      } else {
        setError(res.message)
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      else if (apiErr.status === 403) setError('Ваш обліковий запис не прив\'язаний до профілю водія')
      else setError(apiErr.message ?? 'Не вдалося завантажити замовлення')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadOrders() }, [page, tokens.accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function acceptOrder(orderId: string) {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await apiPostJson<ApiResponse<MyOrder>>(
        `/api/orders/${orderId}/accept`,
        {},
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      )
      if (isSuccess(res)) {
        setData((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: res.data.status } : o)))
      } else {
        setStatusError(res.message)
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      setStatusError(apiErr.message ?? 'Помилка')
    } finally {
      setStatusLoading(false)
    }
  }

  async function changeStatus(orderId: string, newStatus: OrderStatus) {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await apiPatchJson<ApiResponse<MyOrder>>(
        `/api/orders/${orderId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      )
      if (isSuccess(res)) {
        setData((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: res.data.status } : o)))
      } else {
        setStatusError(res.message)
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      setStatusError(apiErr.message ?? 'Помилка зміни статусу')
    } finally {
      setStatusLoading(false)
    }
  }

  const activeCount  = data.filter((o) => ['CONFIRMED', 'DRIVER_ACCEPTED', 'AWAITING_PREPAYMENT', 'PREPAID', 'IN_TRANSIT'].includes(o.status)).length
  const todayCount   = data.filter((o) => {
    const d = new Date(o.pickupDate)
    const today = new Date()
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }).length

  return (
    <div className="dp">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="dp__head">
        <div>
          <h3 className="dp__h">Мої договори</h3>
          <div className="dp__sub">Замовлення, призначені на вас</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void loadOrders()} disabled={isLoading}>
          Оновити
        </Button>
      </div>

      {/* ── Stats strip ─────────────────────────────────── */}
      <div className="dp__stats">
        <div className="dp__stat">
          <div className="dp__statVal">{pagination.total}</div>
          <div className="dp__statLbl">Всього</div>
        </div>
        <div className="dp__stat">
          <div className="dp__statVal dp__statVal--active">{activeCount}</div>
          <div className="dp__statLbl">Активних</div>
        </div>
        <div className="dp__stat">
          <div className="dp__statVal">{todayCount}</div>
          <div className="dp__statLbl">Сьогодні</div>
        </div>
      </div>

      {error && <div className="dp__error">{error}</div>}

      {/* ── Two-column layout ───────────────────────────── */}
      <div className="dp__grid">

        {/* List */}
        <Card title="Список" subtitle={`${pagination.total} замовлень`}>
          <div className="dp__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Статус</th>
                  <th>Забір</th>
                  <th>Доставка</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5}>Завантаження…</td></tr>
                ) : data.length ? (
                  data.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedId(o.id)}
                      style={{ cursor: 'pointer' }}
                      className={o.id === selectedId ? 'dp__row--active' : undefined}
                    >
                      <td>{o.orderNumber}</td>
                      <td><Badge variant={STATUS_BADGE[o.status]}>{STATUS_LABELS[o.status]}</Badge></td>
                      <td className="dp__addr">{o.pickupAddress}</td>
                      <td className="dp__addr">{o.deliveryAddress}</td>
                      <td>{formatDate(o.pickupDate)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5}>Немає призначених замовлень</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="dp__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Назад
            </Button>
            <span className="dp__pageInfo">Стор. {pagination.page} / {pagination.totalPages}</span>
            <Button
              size="sm" variant="ghost"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
            >
              Вперед
            </Button>
          </div>
        </Card>

        {/* Detail */}
        <Card
          title="Деталі замовлення"
          subtitle={selected ? selected.orderNumber : 'Оберіть замовлення'}
        >
          {!selected ? (
            <div className="dp__empty">Натисніть на рядок у таблиці</div>
          ) : (
            <div className="dp__detail">
              {/* Status action */}
              {DRIVER_ACTION[selected.status] && (
                <div className="dp__action">
                  {statusError && <div className="dp__error dp__error--sm">{statusError}</div>}
                  <Button
                    variant="primary"
                    disabled={statusLoading}
                    onClick={() => {
                      const action = DRIVER_ACTION[selected.status]!
                      if (action.accept) void acceptOrder(selected.id)
                      else if (action.next) void changeStatus(selected.id, action.next)
                    }}
                  >
                    {DRIVER_ACTION[selected.status]!.label}
                  </Button>
                </div>
              )}

              <div className="dp__kv">
                <span className="dp__k">Статус</span>
                <span className="dp__v"><Badge variant={STATUS_BADGE[selected.status]}>{STATUS_LABELS[selected.status]}</Badge></span>
              </div>
              <div className="dp__kv">
                <span className="dp__k">Клієнт</span>
                <span className="dp__v">{selected.client?.companyName ?? '—'}</span>
              </div>
              {selected.client && (
                <div className="dp__kv">
                  <span className="dp__k">Контакт</span>
                  <span className="dp__v">{selected.client.contactPerson} · {selected.client.phone}</span>
                </div>
              )}
              <div className="dp__kv">
                <span className="dp__k">Забір</span>
                <span className="dp__v">{selected.pickupAddress}</span>
              </div>
              <div className="dp__kv">
                <span className="dp__k">Доставка</span>
                <span className="dp__v">{selected.deliveryAddress}</span>
              </div>
              <div className="dp__kv">
                <span className="dp__k">Дата забору</span>
                <span className="dp__v">{formatDate(selected.pickupDate)}</span>
              </div>
              <div className="dp__kv">
                <span className="dp__k">Планова дата</span>
                <span className="dp__v">{formatDate(selected.deliveryDate)}</span>
              </div>
              {selected.productType && (
                <div className="dp__kv">
                  <span className="dp__k">Вантаж</span>
                  <span className="dp__v">{selected.productType}{selected.weight ? ` · ${selected.weight} т` : ''}</span>
                </div>
              )}
              {selected.vehicle && (
                <div className="dp__kv">
                  <span className="dp__k">Авто</span>
                  <span className="dp__v">{selected.vehicle.plateNumber} ({selected.vehicle.type})</span>
                </div>
              )}
              {selected.notes && (
                <div className="dp__kv">
                  <span className="dp__k">Примітки</span>
                  <span className="dp__v">{selected.notes}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
