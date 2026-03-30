import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Modal } from '../../ui/Modal'
import { Badge } from '../../ui/Badge'
import { tryGetRolesFromJwt } from '../crm/jwt'
import { RouteMap } from './RouteMap'
import { AddressAutocomplete, type AddressSelection } from './AddressAutocomplete'
import { connectSocket, disconnectSocket, type OrderStatusChangedPayload, type OrderUpdatedPayload } from '../../lib/socket'
import { getApiBaseUrl } from '../../lib/env'
import './orders.css'

/* ─── types ───────────────────────────────────────────── */

type OrderStatus = 'NEW' | 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'
type ExecutionType = 'INTERNAL' | 'EXTERNAL'

type OrderListItem = {
  id: string
  orderNumber: string
  clientName: string
  status: OrderStatus
  executionType: ExecutionType
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  totalCost: number
  clientPrice: number
  margin: number
  marginPercent: number
  clientPaid: boolean
  driverName?: string
  carrierName?: string
  createdAt: string
  updatedAt: string
}

type OrderDetail = {
  id: string
  orderNumber: string
  clientId: string
  client: { id: string; companyName: string; contactPerson: string } | null
  productType?: string
  quantity?: number
  unit?: string
  weight?: number
  volume?: number
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  status: OrderStatus
  executionType: ExecutionType
  driverId?: string
  driver?: { id: string; name: string }
  vehicleId?: string
  vehicle?: { id: string; plateNumber: string; type: string }
  estimatedFuelCost?: number
  estimatedSalaryCost?: number
  carrierId?: string
  carrier?: { id: string; companyName: string }
  carrierAgreedPrice?: number
  carrierPaid: boolean
  carrierVehicleInfo?: string
  internalCost?: number
  externalCost?: number
  totalCost: number
  clientPrice: number
  margin: number
  marginPercent: number
  clientPaid: boolean
  assignedManagerId: string
  assignedManager?: { id: string; name: string; email: string }
  notes?: string
  createdAt: string
  updatedAt: string
}

type LookupClient = { id: string; companyName: string; contactPerson: string }
type LookupDriver = { id: string; name: string }
type LookupVehicle = { id: string; plateNumber: string; type: string; capacity: number }
type LookupCarrier = { id: string; companyName: string }
type Lookups = {
  clients: LookupClient[]
  drivers: LookupDriver[]
  vehicles: LookupVehicle[]
  carriers: LookupCarrier[]
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

/* ─── constants ───────────────────────────────────────── */

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новий',
  CONFIRMED: 'Підтверджений',
  IN_TRANSIT: 'В дорозі',
  DELIVERED: 'Доставлений',
  CANCELLED: 'Скасований',
}

const STATUS_BADGE: Record<OrderStatus, 'accent' | 'neutral' | 'warning' | 'success' | 'danger'> = {
  NEW: 'accent',
  CONFIRMED: 'neutral',
  IN_TRANSIT: 'warning',
  DELIVERED: 'success',
  CANCELLED: 'danger',
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

const EXEC_LABELS: Record<ExecutionType, string> = {
  INTERNAL: 'Власний',
  EXTERNAL: 'Перевізник',
}

/* ─── helpers ─────────────────────────────────────────── */

function isSuccess<T>(res: ApiResponse<T>): res is { success: true; data: T } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

function isListSuccess<T>(res: ApiListResponse<T>): res is { success: true; data: T[]; pagination: Pagination } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateInput(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 16)
}

function money(v: number) {
  return v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function emptyToNull(v: string) {
  const s = v.trim()
  return s || null
}

/* ─── empty form ──────────────────────────────────────── */

const EMPTY_FORM = {
  clientId: '',
  executionType: 'INTERNAL' as ExecutionType,
  pickupAddress: '',
  deliveryAddress: '',
  pickupDate: '',
  deliveryDate: '',
  productType: '',
  quantity: '',
  unit: '',
  weight: '',
  volume: '',
  driverId: '',
  vehicleId: '',
  estimatedFuelCost: '',
  estimatedSalaryCost: '',
  carrierId: '',
  carrierAgreedPrice: '',
  carrierVehicleInfo: '',
  clientPrice: '',
  notes: '',
}
type OrderForm = typeof EMPTY_FORM

/* ─── component ───────────────────────────────────────── */

export function OrdersPage({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const canDelete = roles.includes('ADMIN')
  const canSeeFinance = roles.includes('ADMIN') || roles.includes('MANAGER') || roles.includes('ACCOUNTANT')

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${tokens.accessToken}` }), [tokens.accessToken])

  /* ─── list state ─────────────── */
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [execFilter, setExecFilter] = useState<ExecutionType | ''>('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<OrderListItem[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ─── detail state ───────────── */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<OrderDetail | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  /* ─── modal state ────────────── */
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  /* ─── distance calculation ───── */
  type Coords = [number, number]
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null)
  const [deliveryCoords, setDeliveryCoords] = useState<Coords | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [distanceLoading, setDistanceLoading] = useState(false)
  const distAbortRef = useRef<AbortController | null>(null)

  const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''

  const calcDistance = useCallback(async (from: Coords, to: Coords) => {
    if (!MAPBOX_TOKEN) return
    distAbortRef.current?.abort()
    const ctrl = new AbortController()
    distAbortRef.current = ctrl
    setDistanceLoading(true)
    try {
      const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=false&access_token=${MAPBOX_TOKEN}`
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) return
      const data = await res.json()
      const route = data?.routes?.[0]
      if (route) setDistanceKm(Math.round(route.distance / 1000))
    } catch {
      /* aborted or network error */
    } finally {
      setDistanceLoading(false)
    }
  }, [MAPBOX_TOKEN])

  const handlePickupSelect = useCallback((sel: AddressSelection) => {
    setPickupCoords(sel.coords)
    if (sel.coords && deliveryCoords) void calcDistance(sel.coords, deliveryCoords)
    else setDistanceKm(null)
  }, [deliveryCoords, calcDistance])

  const handleDeliverySelect = useCallback((sel: AddressSelection) => {
    setDeliveryCoords(sel.coords)
    if (pickupCoords && sel.coords) void calcDistance(pickupCoords, sel.coords)
    else setDistanceKm(null)
  }, [pickupCoords, calcDistance])

  /* ─── lookups ────────────────── */
  const [lookups, setLookups] = useState<Lookups | null>(null)

  /* ─── query string ───────────── */
  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    p.set('sortBy', 'created_at')
    p.set('sortOrder', 'desc')
    if (q.trim()) p.set('q', q.trim())
    if (statusFilter) p.set('status', statusFilter)
    if (execFilter) p.set('executionType', execFilter)
    return p.toString()
  }, [page, limit, q, statusFilter, execFilter])

  /* ─── fetchers ───────────────── */

  const loadList = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<OrderListItem>>(`/api/orders?${query}`, { headers: authHeaders })
      if (isListSuccess(res)) {
        setData(res.data)
        setPagination(res.pagination)
      } else {
        setError(res.message)
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setError(apiErr.message ?? 'Не вдалося завантажити замовлення')
    } finally {
      setIsLoading(false)
    }
  }, [query, authHeaders, onUnauthorized])

  useEffect(() => {
    void loadList()
  }, [loadList])

  /* ─── socket real-time ───────── */

  useEffect(() => {
    const socket = connectSocket(tokens.accessToken)

    const onStatusChanged = (payload: OrderStatusChangedPayload) => {
      // Update status in list without full reload
      setData((prev) =>
        prev.map((o) =>
          o.id === payload.orderId ? { ...o, status: payload.newStatus as OrderListItem['status'] } : o,
        ),
      )
      // Refresh details panel if it's the same order
      setDetails((prev) =>
        prev && prev.id === payload.orderId ? { ...prev, status: payload.newStatus as OrderListItem['status'] } : prev,
      )
    }

    const onOrderUpdated = (payload: OrderUpdatedPayload) => {
      if (payload.action === 'deleted') {
        setData((prev) => prev.filter((o) => o.id !== payload.orderId))
        setSelectedId((prev) => (prev === payload.orderId ? null : prev))
      } else if (payload.action === 'created') {
        void loadList()
      }
    }

    socket.on('order:statusChanged', onStatusChanged)
    socket.on('order:updated', onOrderUpdated)

    return () => {
      socket.off('order:statusChanged', onStatusChanged)
      socket.off('order:updated', onOrderUpdated)
      disconnectSocket()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.accessToken])

  /* ─── PDF download ───────────── */

  async function downloadPdf(orderId: string, orderNumber: string) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/pdf`, {
        headers: authHeaders,
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${orderNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* silently ignore */
    }
  }

  async function openDetails(id: string) {
    setSelectedId(id)
    setDetails(null)
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const res = await apiGetJson<ApiResponse<OrderDetail>>(`/api/orders/${id}`, { headers: authHeaders })
      if (isSuccess(res)) setDetails(res.data)
      else setDetailsError(res.message)
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося завантажити деталі')
    } finally {
      setDetailsLoading(false)
    }
  }

  async function loadLookups() {
    if (lookups) return lookups
    try {
      const res = await apiGetJson<ApiResponse<Lookups>>('/api/orders/lookups', { headers: authHeaders })
      if (isSuccess(res)) {
        setLookups(res.data)
        return res.data
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
    }
    return null
  }

  /* ─── status transition ──────── */

  async function changeStatus(newStatus: OrderStatus) {
    if (!selectedId) return
    try {
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000'
      const resp = await fetch(
        `${apiBase}/api/orders/${selectedId}/status`,
        {
          method: 'PATCH',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        },
      )
      const body = await resp.json()
      if (!resp.ok) {
        setDetailsError(body.message ?? 'Не вдалося змінити статус')
        return
      }
      if (body.success) {
        setDetails(body.data)
        await loadList()
      }
    } catch {
      setDetailsError('Не вдалося змінити статус')
    }
  }

  /* ─── create / edit modal ────── */

  async function openCreate() {
    setEditMode('create')
    setForm({ ...EMPTY_FORM })
    setFormError(null)
    setPickupCoords(null)
    setDeliveryCoords(null)
    setDistanceKm(null)
    await loadLookups()
    setEditOpen(true)
  }

  async function openEdit() {
    if (!details) return
    setEditMode('edit')
    setPickupCoords(null)
    setDeliveryCoords(null)
    setDistanceKm(null)
    setForm({
      clientId: details.clientId,
      executionType: details.executionType,
      pickupAddress: details.pickupAddress,
      deliveryAddress: details.deliveryAddress,
      pickupDate: details.pickupDate ? formatDateInput(details.pickupDate) : '',
      deliveryDate: details.deliveryDate ? formatDateInput(details.deliveryDate) : '',
      productType: details.productType ?? '',
      quantity: details.quantity?.toString() ?? '',
      unit: details.unit ?? '',
      weight: details.weight?.toString() ?? '',
      volume: details.volume?.toString() ?? '',
      driverId: details.driverId ?? '',
      vehicleId: details.vehicleId ?? '',
      estimatedFuelCost: details.estimatedFuelCost?.toString() ?? '',
      estimatedSalaryCost: details.estimatedSalaryCost?.toString() ?? '',
      carrierId: details.carrierId ?? '',
      carrierAgreedPrice: details.carrierAgreedPrice?.toString() ?? '',
      carrierVehicleInfo: details.carrierVehicleInfo ?? '',
      clientPrice: details.clientPrice.toString(),
      notes: details.notes ?? '',
    })
    setFormError(null)
    await loadLookups()
    setEditOpen(true)
  }

  async function submitForm() {
    setFormError(null)
    setFormSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        clientId: form.clientId || null,
        executionType: form.executionType,
        pickupAddress: form.pickupAddress.trim() || null,
        deliveryAddress: form.deliveryAddress.trim() || null,
        pickupDate: form.pickupDate || null,
        deliveryDate: emptyToNull(form.deliveryDate),
        productType: emptyToNull(form.productType),
        quantity: form.quantity ? Number(form.quantity) : null,
        unit: emptyToNull(form.unit),
        weight: form.weight ? Number(form.weight) : null,
        volume: form.volume ? Number(form.volume) : null,
        clientPrice: form.clientPrice ? Number(form.clientPrice) : null,
        notes: emptyToNull(form.notes),
      }

      if (form.executionType === 'INTERNAL') {
        payload.driverId = emptyToNull(form.driverId)
        payload.vehicleId = emptyToNull(form.vehicleId)
        payload.estimatedFuelCost = form.estimatedFuelCost ? Number(form.estimatedFuelCost) : null
        payload.estimatedSalaryCost = form.estimatedSalaryCost ? Number(form.estimatedSalaryCost) : null
        payload.carrierId = null
        payload.carrierAgreedPrice = null
        payload.carrierVehicleInfo = null
      } else {
        payload.carrierId = emptyToNull(form.carrierId)
        payload.carrierAgreedPrice = form.carrierAgreedPrice ? Number(form.carrierAgreedPrice) : null
        payload.carrierVehicleInfo = emptyToNull(form.carrierVehicleInfo)
        payload.driverId = null
        payload.vehicleId = null
        payload.estimatedFuelCost = null
        payload.estimatedSalaryCost = null
      }

      if (!payload.clientId || !payload.pickupAddress || !payload.deliveryAddress || !payload.pickupDate || payload.clientPrice === null) {
        setFormError('Клієнт, адреси, дата забору та ціна обовʼязкові')
        return
      }

      if (editMode === 'create') {
        const res = await apiPostJson<ApiResponse<OrderDetail>>('/api/orders', payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        setEditOpen(false)
        await loadList()
        await openDetails(res.data.id)
      } else {
        if (!selectedId) return
        const res = await apiPutJson<ApiResponse<OrderDetail>>(`/api/orders/${selectedId}`, payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        setEditOpen(false)
        setDetails(res.data)
        await loadList()
      }
    } catch (err) {
      const msg =
        typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Помилка'
      setFormError(msg)
    } finally {
      setFormSubmitting(false)
    }
  }

  async function deleteOrder() {
    if (!selectedId || !canDelete) return
    if (!window.confirm('Видалити замовлення?')) return
    try {
      await apiDeleteJson<ApiResponse<{ ok: true }>>(`/api/orders/${selectedId}`, { headers: authHeaders })
      setSelectedId(null)
      setDetails(null)
      await loadList()
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося видалити')
    }
  }

  /* ─── render helpers ─────────── */

  function renderStatusBadge(status: OrderStatus) {
    return <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
  }

  function updateField<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((s) => ({ ...s, [key]: value }))
  }

  const isFinished = details?.status === 'DELIVERED' || details?.status === 'CANCELLED'

  /* ─── JSX ───────────────────────────────────────────── */

  return (
    <div className="orders">
      {/* ── header ── */}
      <div className="orders__head">
        <div>
          <h3 className="orders__h">Замовлення</h3>
          <div className="orders__sub">Перегляд, створення, зміна статусу</div>
        </div>
        <div className="orders__actions">
          <input
            className="ui-input orders__search"
            placeholder="Пошук…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value) }}
          />
          <div className="orders__filters">
            <select
              className="orders__filterSelect"
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value as OrderStatus | '') }}
            >
              <option value="">Усі статуси</option>
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select
              className="orders__filterSelect"
              value={execFilter}
              onChange={(e) => { setPage(1); setExecFilter(e.target.value as ExecutionType | '') }}
            >
              <option value="">Усі типи</option>
              <option value="INTERNAL">{EXEC_LABELS.INTERNAL}</option>
              <option value="EXTERNAL">{EXEC_LABELS.EXTERNAL}</option>
            </select>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void loadList()} disabled={isLoading}>
            Оновити
          </Button>
          <Button size="sm" variant="primary" onClick={() => void openCreate()}>
            + Нове
          </Button>
        </div>
      </div>

      {error && <div className="orders__error">{error}</div>}

      {/* ── grid ── */}
      <div className="orders__grid">
        {/* ── list card ── */}
        <Card title="Список" subtitle={`${pagination.total} замовлень`}>
          <div className="orders__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Клієнт</th>
                  <th>Статус</th>
                  <th>Тип</th>
                  <th>Забір</th>
                  {canSeeFinance && <th>Ціна</th>}
                  {canSeeFinance && <th>Маржа</th>}
                  <th>Оплата</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={canSeeFinance ? 8 : 6}>Завантаження…</td></tr>
                ) : data.length ? (
                  data.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => void openDetails(o.id)}
                      style={{ cursor: 'pointer', background: selectedId === o.id ? 'var(--surface)' : undefined }}
                    >
                      <td>{o.orderNumber}</td>
                      <td>{o.clientName}</td>
                      <td>{renderStatusBadge(o.status)}</td>
                      <td>{EXEC_LABELS[o.executionType]}</td>
                      <td>{formatDate(o.pickupDate)}</td>
                      {canSeeFinance && <td>{money(o.clientPrice)} ₴</td>}
                      {canSeeFinance && (
                        <td style={{ color: o.margin < 0 ? 'var(--danger)' : undefined }}>
                          {money(o.margin)} ({o.marginPercent.toFixed(1)}%)
                        </td>
                      )}
                      <td>
                        <span className={`orders__paid orders__paid--${o.clientPaid ? 'yes' : 'no'}`}>
                          {o.clientPaid ? 'Так' : 'Ні'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={canSeeFinance ? 8 : 6}>Порожньо</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="orders__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Назад
            </Button>
            <div className="orders__page">
              Сторінка {pagination.page} / {pagination.totalPages}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
            >
              Далі
            </Button>
          </div>
        </Card>

        {/* ── detail card ── */}
        <Card
          title="Деталі"
          subtitle={details ? details.orderNumber : 'Вибери замовлення'}
          right={
            selectedId ? (
              <div className="orders__detailActions">
                <Button size="sm" variant="secondary" onClick={() => void openEdit()} disabled={!details || detailsLoading || isFinished}>
                  Редагувати
                </Button>
                {details && (
                  <Button size="sm" variant="ghost" onClick={() => void downloadPdf(details.id, details.orderNumber)}>
                    PDF
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void deleteOrder()} disabled={!canDelete || detailsLoading}>
                  Видалити
                </Button>
              </div>
            ) : null
          }
        >
          {detailsError && <div className="orders__error">{detailsError}</div>}
          {detailsLoading ? (
            <div>Завантаження…</div>
          ) : details ? (
            <div className="orders__details">
              {/* status bar */}
              <div className="orders__statusBar">
                <span style={{ marginRight: 8 }}>Статус: {renderStatusBadge(details.status)}</span>
                {STATUS_TRANSITIONS[details.status].map((next) => (
                  <Button key={next} size="sm" variant={next === 'CANCELLED' ? 'ghost' : 'primary'} onClick={() => void changeStatus(next)}>
                    → {STATUS_LABELS[next]}
                  </Button>
                ))}
              </div>

              {/* general */}
              <div className="orders__section">Загальне</div>
              <KV k="Клієнт" v={details.client?.companyName ?? '—'} />
              <KV k="Контакт" v={details.client?.contactPerson ?? '—'} />
              <KV k="Тип виконання" v={EXEC_LABELS[details.executionType]} />
              <KV k="Менеджер" v={details.assignedManager?.name ?? '—'} />

              {/* cargo */}
              <div className="orders__section">Вантаж</div>
              <KV k="Тип продукції" v={details.productType ?? '—'} />
              <KV k="Кількість" v={details.quantity != null ? `${details.quantity} ${details.unit ?? ''}` : '—'} />
              <KV k="Вага (т)" v={details.weight?.toString() ?? '—'} />
              <KV k="Обʼєм (м³)" v={details.volume?.toString() ?? '—'} />

              {/* route */}
              <div className="orders__section">Маршрут</div>
              <KV k="Звідки" v={details.pickupAddress} />
              <KV k="Куди" v={details.deliveryAddress} />
              <KV k="Дата забору" v={formatDate(details.pickupDate)} />
              <KV k="Дата доставки" v={details.deliveryDate ? formatDate(details.deliveryDate) : '—'} />

              {details.pickupAddress && details.deliveryAddress && (
                <RouteMap pickupAddress={details.pickupAddress} deliveryAddress={details.deliveryAddress} />
              )}

              {/* resources */}
              <div className="orders__section">
                {details.executionType === 'INTERNAL' ? 'Власні ресурси' : 'Перевізник'}
              </div>
              {details.executionType === 'INTERNAL' ? (
                <>
                  <KV k="Водій" v={details.driver?.name ?? '—'} />
                  <KV k="Транспорт" v={details.vehicle ? `${details.vehicle.plateNumber} (${details.vehicle.type})` : '—'} />
                  <KV k="Пальне (оцінка)" v={details.estimatedFuelCost != null ? `${money(details.estimatedFuelCost)} ₴` : '—'} />
                  <KV k="Зарплата (оцінка)" v={details.estimatedSalaryCost != null ? `${money(details.estimatedSalaryCost)} ₴` : '—'} />
                </>
              ) : (
                <>
                  <KV k="Перевізник" v={details.carrier?.companyName ?? '—'} />
                  <KV k="Ціна перевізника" v={details.carrierAgreedPrice != null ? `${money(details.carrierAgreedPrice)} ₴` : '—'} />
                  <KV k="Оплата перевізнику" v={details.carrierPaid ? 'Оплачено' : 'Не оплачено'} />
                  <KV k="Інфо про ТЗ" v={details.carrierVehicleInfo ?? '—'} />
                </>
              )}

              {/* finance */}
              {canSeeFinance && (
                <>
                  <div className="orders__section">Фінанси</div>
                  <KV k="Собівартість" v={`${money(details.totalCost)} ₴`} />
                  <KV k="Ціна клієнту" v={`${money(details.clientPrice)} ₴`} />
                  <KV
                    k="Маржа"
                    v={
                      <span style={{ color: details.margin < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {money(details.margin)} ₴ ({details.marginPercent.toFixed(1)}%)
                      </span>
                    }
                  />
                  <KV
                    k="Оплата клієнтом"
                    v={
                      <span className={`orders__paid orders__paid--${details.clientPaid ? 'yes' : 'no'}`}>
                        {details.clientPaid ? 'Оплачено' : 'Не оплачено'}
                      </span>
                    }
                  />
                </>
              )}

              {/* notes */}
              {details.notes && (
                <>
                  <div className="orders__section">Нотатки</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{details.notes}</div>
                </>
              )}

              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                Створено: {formatDate(details.createdAt)} · Оновлено: {formatDate(details.updatedAt)}
              </div>
            </div>
          ) : (
            <div className="orders__empty">Клікни рядок у списку</div>
          )}
        </Card>
      </div>

      {/* ── create/edit modal ── */}
      <Modal
        open={editOpen}
        title={editMode === 'create' ? 'Нове замовлення' : 'Редагування замовлення'}
        onClose={() => setEditOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={formSubmitting}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={() => void submitForm()} disabled={formSubmitting}>
              {formSubmitting ? 'Збереження…' : 'Зберегти'}
            </Button>
          </>
        }
      >
        {formError && <div className="orders__error">{formError}</div>}
        <div className="orders__form">

          {/* ── section: general ── */}
          <div className="orders__formSection">Основне</div>

          <label className="orders__field">
            <span className="orders__label">Клієнт *</span>
            <select className="ui-input" value={form.clientId} onChange={(e) => updateField('clientId', e.target.value)}>
              <option value="">— Вибрати —</option>
              {lookups?.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName} ({c.contactPerson})</option>
              ))}
            </select>
          </label>

          <label className="orders__field">
            <span className="orders__label">Тип виконання *</span>
            <select className="ui-input" value={form.executionType} onChange={(e) => updateField('executionType', e.target.value as ExecutionType)}>
              <option value="INTERNAL">Власний</option>
              <option value="EXTERNAL">Перевізник</option>
            </select>
          </label>

          {/* ── section: route ── */}
          <div className="orders__formSection">Маршрут</div>

          <div className="orders__field">
            <span className="orders__label">Адреса забору (A) *</span>
            <AddressAutocomplete
              value={form.pickupAddress}
              onChange={(v) => updateField('pickupAddress', v)}
              onSelect={handlePickupSelect}
              placeholder="Почніть вводити адресу…"
            />
          </div>
          <div className="orders__field">
            <span className="orders__label">Адреса доставки (Б) *</span>
            <AddressAutocomplete
              value={form.deliveryAddress}
              onChange={(v) => updateField('deliveryAddress', v)}
              onSelect={handleDeliverySelect}
              placeholder="Почніть вводити адресу…"
            />
          </div>

          {/* distance banner */}
          {(distanceKm !== null || distanceLoading) && (
            <div className={`orders__distBanner${distanceLoading ? ' orders__distBanner--loading' : ''}`}>
              <svg className="orders__distIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" />
                <path d="M5 15V7a2 2 0 0 1 2-2h3l2 3h5a2 2 0 0 1 2 2v5" />
              </svg>
              {distanceLoading ? (
                <span>Розрахунок відстані…</span>
              ) : (
                <span>
                  Відстань маршруту: <span className="orders__distValue">{distanceKm} км</span>
                  <span className="orders__distLabel"> — враховуйте при розрахунку пального та ЗП</span>
                </span>
              )}
            </div>
          )}

          <label className="orders__field">
            <span className="orders__label">Дата забору *</span>
            <input className="ui-input" type="datetime-local" value={form.pickupDate} onChange={(e) => updateField('pickupDate', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Дата доставки</span>
            <input className="ui-input" type="datetime-local" value={form.deliveryDate} onChange={(e) => updateField('deliveryDate', e.target.value)} />
          </label>

          {/* ── section: cargo ── */}
          <div className="orders__formSection">Вантаж</div>

          <label className="orders__field">
            <span className="orders__label">Тип продукції</span>
            <input className="ui-input" value={form.productType} onChange={(e) => updateField('productType', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Кількість</span>
            <input className="ui-input" type="number" step="any" value={form.quantity} onChange={(e) => updateField('quantity', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Одиниця</span>
            <input className="ui-input" placeholder="тонн, паллет, м³" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Вага (т)</span>
            <input className="ui-input" type="number" step="any" value={form.weight} onChange={(e) => updateField('weight', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Обʼєм (м³)</span>
            <input className="ui-input" type="number" step="any" value={form.volume} onChange={(e) => updateField('volume', e.target.value)} />
          </label>

          {/* ── section: finance ── */}
          <div className="orders__formSection">Фінанси</div>

          <label className="orders__field">
            <span className="orders__label">Ціна клієнту (₴) *</span>
            <input className="ui-input" type="number" step="0.01" value={form.clientPrice} onChange={(e) => updateField('clientPrice', e.target.value)} />
          </label>

          {/* ── section: resources ── */}
          <div className="orders__formSection">
            {form.executionType === 'INTERNAL' ? 'Власні ресурси' : 'Перевізник'}
          </div>

          {form.executionType === 'INTERNAL' && (
            <>
              <label className="orders__field">
                <span className="orders__label">Водій</span>
                <select className="ui-input" value={form.driverId} onChange={(e) => updateField('driverId', e.target.value)}>
                  <option value="">— Без водія —</option>
                  {lookups?.drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label className="orders__field">
                <span className="orders__label">Транспорт</span>
                <select className="ui-input" value={form.vehicleId} onChange={(e) => updateField('vehicleId', e.target.value)}>
                  <option value="">— Без ТЗ —</option>
                  {lookups?.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.plateNumber} ({v.type}, {v.capacity}т)</option>
                  ))}
                </select>
              </label>
              <label className="orders__field">
                <span className="orders__label">Пальне (оцінка, ₴)</span>
                <input className="ui-input" type="number" step="0.01" value={form.estimatedFuelCost} onChange={(e) => updateField('estimatedFuelCost', e.target.value)} />
              </label>
              <label className="orders__field">
                <span className="orders__label">Зарплата (₴)</span>
                <input className="ui-input" type="number" step="0.01" value={form.estimatedSalaryCost} onChange={(e) => updateField('estimatedSalaryCost', e.target.value)} />
              </label>
            </>
          )}

          {form.executionType === 'EXTERNAL' && (
            <>
              <label className="orders__field">
                <span className="orders__label">Перевізник</span>
                <select className="ui-input" value={form.carrierId} onChange={(e) => updateField('carrierId', e.target.value)}>
                  <option value="">— Без перевізника —</option>
                  {lookups?.carriers.map((c) => (
                    <option key={c.id} value={c.id}>{c.companyName}</option>
                  ))}
                </select>
              </label>
              <label className="orders__field">
                <span className="orders__label">Ціна перевізника (₴)</span>
                <input className="ui-input" type="number" step="0.01" value={form.carrierAgreedPrice} onChange={(e) => updateField('carrierAgreedPrice', e.target.value)} />
              </label>
              <label className="orders__field orders__field--full">
                <span className="orders__label">Інфо про транспорт перевізника</span>
                <input className="ui-input" value={form.carrierVehicleInfo} onChange={(e) => updateField('carrierVehicleInfo', e.target.value)} />
              </label>
            </>
          )}

          {/* ── section: notes ── */}
          <div className="orders__formSection">Додатково</div>

          <label className="orders__field orders__field--full">
            <span className="orders__label">Нотатки</span>
            <textarea className="ui-input" rows={3} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
          </label>
        </div>
      </Modal>
    </div>
  )
}

/* ─── key-value row ───────────────────────────────────── */

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="orders__kv">
      <div className="orders__k">{k}</div>
      <div className="orders__v">{v}</div>
    </div>
  )
}
