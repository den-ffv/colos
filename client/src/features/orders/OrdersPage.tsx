import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { Modal } from '../../ui/Modal'
import { Badge } from '../../ui/Badge'
import { tryGetRolesFromJwt } from '../crm/jwt'
import { RouteMap } from './RouteMap'
import { AddressAutocomplete, type AddressSelection } from './AddressAutocomplete'
import type { OrderDetail as CreateOrderDetail } from './CreateOrderPage'
import { connectSocket, disconnectSocket, type OrderStatusChangedPayload, type OrderUpdatedPayload } from '../../lib/socket'
import { getApiBaseUrl } from '../../lib/env'
import './orders.css'

/* ─── types ───────────────────────────────────────────── */

type OrderStatus =
  | 'NEW' | 'CONFIRMED' | 'DRIVER_ACCEPTED'
  | 'AWAITING_PREPAYMENT' | 'PREPAID'
  | 'IN_TRANSIT' | 'DELIVERED'
  | 'AWAITING_FINAL_PAYMENT' | 'COMPLETED' | 'CANCELLED'
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
  prepaidAmount?: number
  prepaidAt?: string
  prepaymentReceipt?: string
  finalPaidAmount?: number
  finalPaymentReceipt?: string
  finalPaidAt?: string
  totalPaid: number
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
  NEW:                    'Новий',
  CONFIRMED:              'Підтверджений',
  DRIVER_ACCEPTED:        'Водій прийняв',
  AWAITING_PREPAYMENT:    'Очікує авансу',
  PREPAID:                'Аванс оплачено',
  IN_TRANSIT:             'В дорозі',
  DELIVERED:              'Доставлений',
  AWAITING_FINAL_PAYMENT: 'Очікує доплати',
  COMPLETED:              'Завершений',
  CANCELLED:              'Скасований',
}

const STATUS_BADGE: Record<OrderStatus, 'accent' | 'neutral' | 'warning' | 'success' | 'danger'> = {
  NEW:                    'accent',
  CONFIRMED:              'neutral',
  DRIVER_ACCEPTED:        'neutral',
  AWAITING_PREPAYMENT:    'warning',
  PREPAID:                'warning',
  IN_TRANSIT:             'warning',
  DELIVERED:              'success',
  AWAITING_FINAL_PAYMENT: 'warning',
  COMPLETED:              'success',
  CANCELLED:              'danger',
}

// Ручні переходи через кнопку (тільки для ADMIN/LOGIST)
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW:                    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:              ['CANCELLED'],
  DRIVER_ACCEPTED:        ['CANCELLED'],
  AWAITING_PREPAYMENT:    ['CANCELLED'],
  PREPAID:                ['CANCELLED'],
  IN_TRANSIT:             ['CANCELLED'],
  DELIVERED:              [],
  AWAITING_FINAL_PAYMENT: [],
  COMPLETED:              [],
  CANCELLED:              [],
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
  onCreateNew,
  onEditOrder,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
  onCreateNew?: () => void
  onEditOrder?: (order: CreateOrderDetail) => void
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
  const [detailOpen, setDetailOpen] = useState(false)

  /* ─── modal state ────────────── */
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM })
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formSubmitting, setFormSubmitting] = useState(false)

  function validateOrderForm(f: OrderForm): Record<string, string> {
    const errors: Record<string, string> = {}

    if (!f.clientId) errors.clientId = 'Оберіть клієнта'

    if (!f.pickupAddress.trim()) errors.pickupAddress = 'Обовʼязкове поле'
    else if (f.pickupAddress.trim().length < 5) errors.pickupAddress = 'Мінімум 5 символів'
    else if (f.pickupAddress.trim().length > 500) errors.pickupAddress = 'Максимум 500 символів'

    if (!f.deliveryAddress.trim()) errors.deliveryAddress = 'Обовʼязкове поле'
    else if (f.deliveryAddress.trim().length < 5) errors.deliveryAddress = 'Мінімум 5 символів'
    else if (f.deliveryAddress.trim().length > 500) errors.deliveryAddress = 'Максимум 500 символів'

    if (!f.pickupDate) errors.pickupDate = 'Вкажіть дату забору'
    else if (Number.isNaN(Date.parse(f.pickupDate))) errors.pickupDate = 'Невірний формат дати'

    if (f.deliveryDate) {
      if (Number.isNaN(Date.parse(f.deliveryDate))) errors.deliveryDate = 'Невірний формат дати'
      else if (f.pickupDate && !Number.isNaN(Date.parse(f.pickupDate)) && Date.parse(f.deliveryDate) < Date.parse(f.pickupDate))
        errors.deliveryDate = 'Не може бути раніше дати забору'
    }

    if (f.clientPrice === '') errors.clientPrice = 'Обовʼязкове поле'
    else if (Number.isNaN(Number(f.clientPrice)) || Number(f.clientPrice) < 0)
      errors.clientPrice = 'Повинна бути ≥ 0'

    if (f.quantity && (Number.isNaN(Number(f.quantity)) || Number(f.quantity) <= 0))
      errors.quantity = 'Повинна бути > 0'
    if (f.weight && (Number.isNaN(Number(f.weight)) || Number(f.weight) <= 0))
      errors.weight = 'Повинна бути > 0'
    if (f.volume && (Number.isNaN(Number(f.volume)) || Number(f.volume) <= 0))
      errors.volume = 'Повинна бути > 0'

    if (f.estimatedFuelCost && (Number.isNaN(Number(f.estimatedFuelCost)) || Number(f.estimatedFuelCost) < 0))
      errors.estimatedFuelCost = 'Не може бути відʼємним'
    if (f.estimatedSalaryCost && (Number.isNaN(Number(f.estimatedSalaryCost)) || Number(f.estimatedSalaryCost) < 0))
      errors.estimatedSalaryCost = 'Не може бути відʼємним'
    if (f.carrierAgreedPrice && (Number.isNaN(Number(f.carrierAgreedPrice)) || Number(f.carrierAgreedPrice) < 0))
      errors.carrierAgreedPrice = 'Не може бути відʼємним'

    return errors
  }

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

  // Cancel confirmation modal
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

  // Payment modals
  const [paymentModal, setPaymentModal] = useState<'prepaid' | 'final' | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentTargetId, setPaymentTargetId] = useState<string | null>(null)
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null)
  const [receiptName, setReceiptName]   = useState<string | null>(null)

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

  /* ─── PDF send / download ───────────── */

  const [sendPdfState, setSendPdfState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [sendPdfError, setSendPdfError] = useState<string | null>(null)

  async function sendPdf(orderId: string) {
    setSendPdfState('sending')
    setSendPdfError(null)
    try {
      const res = await apiPostJson<ApiResponse<{ sent: boolean; to: string }>>(
        `/api/orders/${orderId}/send-pdf`,
        {},
        { headers: authHeaders },
      )
      if (isSuccess(res)) {
        setSendPdfState('ok')
        setTimeout(() => setSendPdfState('idle'), 3000)
      } else {
        setSendPdfError((res as { message: string }).message)
        setSendPdfState('err')
        setTimeout(() => setSendPdfState('idle'), 4000)
      }
    } catch {
      setSendPdfError('Помилка відправки')
      setSendPdfState('err')
      setTimeout(() => setSendPdfState('idle'), 4000)
    }
  }

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
    setDetailOpen(true)
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

  function closeDetails() {
    setDetailOpen(false)
    setSelectedId(null)
    setDetails(null)
    setDetailsError(null)
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

  async function confirmCancel() {
    setCancelSubmitting(true)
    await changeStatus('CANCELLED')
    setCancelSubmitting(false)
    setCancelConfirmOpen(false)
  }

  /* ─── payment actions ────────── */

  const [resendPrepayState, setResendPrepayState]   = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [resendFinalState,   setResendFinalState]   = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')

  async function resendPrepayment(orderId: string) {
    setResendPrepayState('sending')
    try {
      const res = await apiPostJson<ApiResponse<{ sent: boolean; to: string }>>(
        `/api/orders/${orderId}/resend-prepayment`,
        {},
        { headers: authHeaders },
      )
      if (isSuccess(res)) {
        setResendPrepayState('ok')
        setTimeout(() => setResendPrepayState('idle'), 3000)
      } else {
        setResendPrepayState('err')
        setDetailsError((res as { message: string }).message)
        setTimeout(() => setResendPrepayState('idle'), 4000)
      }
    } catch (err) {
      setResendPrepayState('err')
      setDetailsError((err as Partial<ApiError>).message ?? 'Помилка відправки')
      setTimeout(() => setResendPrepayState('idle'), 4000)
    }
  }

  async function resendFinalInvoice(orderId: string) {
    setResendFinalState('sending')
    try {
      const res = await apiPostJson<ApiResponse<{ sent: boolean; to: string }>>(
        `/api/orders/${orderId}/resend-final-invoice`,
        {},
        { headers: authHeaders },
      )
      if (isSuccess(res)) {
        setResendFinalState('ok')
        setTimeout(() => setResendFinalState('idle'), 3000)
      } else {
        setResendFinalState('err')
        setDetailsError((res as { message: string }).message)
        setTimeout(() => setResendFinalState('idle'), 4000)
      }
    } catch (err) {
      setResendFinalState('err')
      setDetailsError((err as Partial<ApiError>).message ?? 'Помилка відправки')
      setTimeout(() => setResendFinalState('idle'), 4000)
    }
  }

  async function requestPrepayment(orderId: string) {
    try {
      const res = await apiPostJson<ApiResponse<OrderDetail>>(
        `/api/orders/${orderId}/request-prepayment`,
        {},
        { headers: authHeaders },
      )
      if (isSuccess(res)) { setDetails(res.data); void loadList() }
    } catch (err) {
      const e = err as Partial<ApiError>
      if (e.status === 401) onUnauthorized()
      setDetailsError(e.message ?? 'Помилка')
    }
  }

  function openMarkPrepaid(order: OrderDetail) {
    setPaymentTargetId(order.id)
    setPaymentModal('prepaid')
    setPaymentAmount('')
    setPaymentError(null)
    setReceiptBase64(null)
    setReceiptName(null)
  }

  function openMarkFinalPaid(order: OrderDetail) {
    setPaymentTargetId(order.id)
    setPaymentModal('final')
    setPaymentAmount('')
    setPaymentError(null)
    setReceiptBase64(null)
    setReceiptName(null)
  }

  async function submitPayment() {
    if (!paymentTargetId || !paymentModal) return
    setPaymentSubmitting(true)
    setPaymentError(null)
    try {
      const endpoint = paymentModal === 'prepaid'
        ? `/api/orders/${paymentTargetId}/mark-prepaid`
        : `/api/orders/${paymentTargetId}/mark-final-paid`
      const payload: Record<string, unknown> = {}
      if (receiptBase64) payload.receipt = receiptBase64
      const res = await apiPostJson<ApiResponse<OrderDetail>>(endpoint, payload, { headers: authHeaders })
      if (isSuccess(res)) {
        setDetails(res.data)
        void loadList()
        setPaymentModal(null)
      }
    } catch (err) {
      const e = err as Partial<ApiError>
      if (e.status === 401) onUnauthorized()
      setPaymentError(e.message ?? 'Помилка збереження')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  /* ─── create / edit modal ────── */

  async function openCreate() {
    if (onCreateNew) { onCreateNew(); return }
    setEditMode('create')
    setForm({ ...EMPTY_FORM })
    setFormError(null)
    setFieldErrors({})
    setPickupCoords(null)
    setDeliveryCoords(null)
    setDistanceKm(null)
    await loadLookups()
    setEditOpen(true)
  }

  async function openEdit() {
    if (!details) return
    if (onEditOrder) {
      onEditOrder({
        id: details.id,
        orderNumber: details.orderNumber,
        clientId: details.clientId,
        executionType: details.executionType,
        pickupAddress: details.pickupAddress,
        deliveryAddress: details.deliveryAddress,
        pickupDate: details.pickupDate,
        deliveryDate: details.deliveryDate,
        productType: details.productType,
        quantity: details.quantity,
        unit: details.unit,
        weight: details.weight,
        volume: details.volume,
        driverId: details.driverId,
        vehicleId: details.vehicleId,
        estimatedFuelCost: details.estimatedFuelCost,
        estimatedSalaryCost: details.estimatedSalaryCost,
        carrierId: details.carrierId,
        carrierAgreedPrice: details.carrierAgreedPrice,
        carrierVehicleInfo: details.carrierVehicleInfo,
        clientPrice: details.clientPrice,
        notes: details.notes,
      })
      return
    }
    setEditMode('edit')
    setPickupCoords(null)
    setDeliveryCoords(null)
    setDistanceKm(null)
    setFormError(null)
    setFieldErrors({})
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
    const errors = validateOrderForm(form)
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
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

  const isFinished = details?.status === 'COMPLETED' || details?.status === 'CANCELLED'
  const canManagePayments = roles.includes('ADMIN') || roles.includes('LOGIST')

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

      {/* ── list ── */}
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
                    style={{ cursor: 'pointer' }}
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

      {/* ── detail modal ── */}
      <Modal
        open={detailOpen}
        title={details ? `Деталі замовлення ${details.orderNumber}` : 'Деталі замовлення'}
        onClose={closeDetails}
        size="lg"
        footer={
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
              {details && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void sendPdf(details.id)}
                  disabled={sendPdfState === 'sending'}
                >
                  {sendPdfState === 'sending' ? 'Надсилання…' : sendPdfState === 'ok' ? '✓ Надіслано' : '✉ Надіслати PDF клієнту'}
                </Button>
              )}
              {sendPdfState === 'err' && sendPdfError && (
                <span style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>{sendPdfError}</span>
              )}
              <Button size="sm" variant="ghost" onClick={() => void deleteOrder()} disabled={!canDelete || detailsLoading}>
                Видалити
              </Button>
            </div>
          ) : undefined
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
              {/* Звичайні переходи статусів */}
              {STATUS_TRANSITIONS[details.status].map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant={next === 'CANCELLED' ? 'ghost' : 'primary'}
                  onClick={() => next === 'CANCELLED' ? setCancelConfirmOpen(true) : void changeStatus(next)}
                >
                  → {STATUS_LABELS[next]}
                </Button>
              ))}
              {/* Спеціальні дії для ADMIN/LOGIST */}
              {canManagePayments && details.status === 'DRIVER_ACCEPTED' && (
                <Button size="sm" variant="primary" onClick={() => void requestPrepayment(details.id)}>
                  Запросити аванс
                </Button>
              )}
              {canManagePayments && details.status === 'AWAITING_PREPAYMENT' && (
                <>
                  <Button size="sm" variant="primary" onClick={() => void openMarkPrepaid(details)}>
                    Зафіксувати аванс
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void resendPrepayment(details.id)}
                    disabled={resendPrepayState === 'sending'}
                    title="Повторно надіслати рахунок на аванс клієнту"
                  >
                    {resendPrepayState === 'sending'
                      ? 'Надсилання…'
                      : resendPrepayState === 'ok'
                        ? '✓ Надіслано'
                        : '✉ Нагадати про аванс'}
                  </Button>
                </>
              )}
              {canManagePayments && details.status === 'AWAITING_FINAL_PAYMENT' && (
                <>
                  <Button size="sm" variant="primary" onClick={() => void openMarkFinalPaid(details)}>
                    Зафіксувати оплату
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void resendFinalInvoice(details.id)}
                    disabled={resendFinalState === 'sending'}
                    title="Повторно надіслати рахунок на фінальну оплату клієнту"
                  >
                    {resendFinalState === 'sending'
                      ? 'Надсилання…'
                      : resendFinalState === 'ok'
                        ? '✓ Надіслано'
                        : '✉ Нагадати про оплату'}
                  </Button>
                </>
              )}
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

            {/* payments panel */}
            {canSeeFinance && (details.prepaidAmount != null || details.finalPaidAmount != null || details.totalPaid > 0) && (
              <>
                <div className="orders__section">Оплати</div>
                {details.prepaidAmount != null && (
                  <KV k="Аванс" v={`${money(details.prepaidAmount)} ₴${details.prepaidAt ? ` · ${formatDate(details.prepaidAt)}` : ''}`} />
                )}
                {details.prepaymentReceipt && (
                  <KV k="Квитанція" v={
                    <a
                      href={details.prepaymentReceipt}
                      download="квитанція"
                      style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'underline' }}
                    >
                      📎 Завантажити квитанцію
                    </a>
                  } />
                )}
                {details.finalPaidAmount != null && (
                  <KV k="Фінальна оплата" v={`${money(details.finalPaidAmount)} ₴${details.finalPaidAt ? ` · ${formatDate(details.finalPaidAt)}` : ''}`} />
                )}
                {details.finalPaymentReceipt && (
                  <KV k="Квитанція (фінал)" v={
                    <a
                      href={details.finalPaymentReceipt}
                      download="квитанція-фінал"
                      style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'underline' }}
                    >
                      📎 Завантажити квитанцію
                    </a>
                  } />
                )}
                <KV k="Всього сплачено" v={`${money(details.totalPaid)} ₴`} />
                <KV
                  k="Залишок"
                  v={
                    <span style={{ color: details.clientPrice - details.totalPaid > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {money(Math.max(0, details.clientPrice - details.totalPaid))} ₴
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
        ) : null}
      </Modal>

      {/* ── create/edit modal ── */}
      <Drawer
        open={editOpen}
        title={editMode === 'create' ? 'Нове замовлення' : 'Редагування замовлення'}
        onClose={() => setEditOpen(false)}
        width={700}
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
            {fieldErrors.clientId && <span className="orders__fieldError">{fieldErrors.clientId}</span>}
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
            {fieldErrors.pickupAddress && <span className="orders__fieldError">{fieldErrors.pickupAddress}</span>}
          </div>
          <div className="orders__field">
            <span className="orders__label">Адреса доставки (Б) *</span>
            <AddressAutocomplete
              value={form.deliveryAddress}
              onChange={(v) => updateField('deliveryAddress', v)}
              onSelect={handleDeliverySelect}
              placeholder="Почніть вводити адресу…"
            />
            {fieldErrors.deliveryAddress && <span className="orders__fieldError">{fieldErrors.deliveryAddress}</span>}
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
            {fieldErrors.pickupDate && <span className="orders__fieldError">{fieldErrors.pickupDate}</span>}
          </label>
          <label className="orders__field">
            <span className="orders__label">Дата доставки</span>
            <input className="ui-input" type="datetime-local" value={form.deliveryDate} onChange={(e) => updateField('deliveryDate', e.target.value)} />
            {fieldErrors.deliveryDate && <span className="orders__fieldError">{fieldErrors.deliveryDate}</span>}
          </label>

          {/* ── section: cargo ── */}
          <div className="orders__formSection">Вантаж</div>

          <label className="orders__field">
            <span className="orders__label">Тип продукції</span>
            <input className="ui-input" value={form.productType} onChange={(e) => updateField('productType', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Кількість</span>
            <input className="ui-input" type="number" step="any" min="0" value={form.quantity} onChange={(e) => updateField('quantity', e.target.value)} />
            {fieldErrors.quantity && <span className="orders__fieldError">{fieldErrors.quantity}</span>}
          </label>
          <label className="orders__field">
            <span className="orders__label">Одиниця</span>
            <input className="ui-input" placeholder="тонн, паллет, м³" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} />
          </label>
          <label className="orders__field">
            <span className="orders__label">Вага (т)</span>
            <input className="ui-input" type="number" step="any" min="0" value={form.weight} onChange={(e) => updateField('weight', e.target.value)} />
            {fieldErrors.weight && <span className="orders__fieldError">{fieldErrors.weight}</span>}
          </label>
          <label className="orders__field">
            <span className="orders__label">Обʼєм (м³)</span>
            <input className="ui-input" type="number" step="any" min="0" value={form.volume} onChange={(e) => updateField('volume', e.target.value)} />
            {fieldErrors.volume && <span className="orders__fieldError">{fieldErrors.volume}</span>}
          </label>

          {/* ── section: finance ── */}
          <div className="orders__formSection">Фінанси</div>

          <label className="orders__field">
            <span className="orders__label">Ціна клієнту (₴) *</span>
            <input className="ui-input" type="number" step="0.01" min="0" value={form.clientPrice} onChange={(e) => updateField('clientPrice', e.target.value)} />
            {fieldErrors.clientPrice && <span className="orders__fieldError">{fieldErrors.clientPrice}</span>}
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
                <input className="ui-input" type="number" step="0.01" min="0" value={form.estimatedFuelCost} onChange={(e) => updateField('estimatedFuelCost', e.target.value)} />
                {fieldErrors.estimatedFuelCost && <span className="orders__fieldError">{fieldErrors.estimatedFuelCost}</span>}
              </label>
              <label className="orders__field">
                <span className="orders__label">Зарплата (₴)</span>
                <input className="ui-input" type="number" step="0.01" min="0" value={form.estimatedSalaryCost} onChange={(e) => updateField('estimatedSalaryCost', e.target.value)} />
                {fieldErrors.estimatedSalaryCost && <span className="orders__fieldError">{fieldErrors.estimatedSalaryCost}</span>}
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
                <input className="ui-input" type="number" step="0.01" min="0" value={form.carrierAgreedPrice} onChange={(e) => updateField('carrierAgreedPrice', e.target.value)} />
                {fieldErrors.carrierAgreedPrice && <span className="orders__fieldError">{fieldErrors.carrierAgreedPrice}</span>}
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
      </Drawer>

      {/* ── cancel confirmation modal ── */}
      {cancelConfirmOpen && (
        <div className="ui-modal__overlay" onMouseDown={() => !cancelSubmitting && setCancelConfirmOpen(false)}>
          <div className="ui-modal ui-card" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="ui-modal__head">
              <span className="ui-modal__title">Скасування договору</span>
              <button className="ui-modal__close" onClick={() => setCancelConfirmOpen(false)} disabled={cancelSubmitting}>✕</button>
            </div>
            <div className="ui-modal__body" style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 15 }}>
                Ви впевнені, що хочете скасувати цей договір?
              </p>
              {details && (
                <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--muted)' }}>
                  {details.orderNumber} · {details.pickupAddress} → {details.deliveryAddress}
                </p>
              )}
              <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--danger, #dc2626)' }}>
                Цю дію неможливо скасувати.
              </p>
            </div>
            <div className="ui-modal__foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => setCancelConfirmOpen(false)} disabled={cancelSubmitting}>
                Назад
              </Button>
              <Button variant="danger" size="sm" onClick={() => void confirmCancel()} disabled={cancelSubmitting}>
                {cancelSubmitting ? 'Скасування…' : 'Скасувати договір'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── payment amount modal ── */}
      {paymentModal && (
        <div className="ui-modal__overlay" onMouseDown={() => !paymentSubmitting && setPaymentModal(null)}>
          <div className="ui-modal ui-card" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="ui-modal__head">
              <div className="ui-modal__title">
                {paymentModal === 'prepaid' ? 'Зафіксувати аванс' : 'Зафіксувати фінальну оплату'}
              </div>
              <button className="ui-modal__close" onClick={() => setPaymentModal(null)} disabled={paymentSubmitting}>✕</button>
            </div>
            <div className="ui-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paymentError && <div className="orders__error">{paymentError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.3px' }}>
                  Квитанція про оплату
                </span>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  border: '1px dashed var(--border)', borderRadius: 6,
                  padding: '10px 14px', background: 'var(--surface-2)',
                }}>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setReceiptName(file.name)
                      const reader = new FileReader()
                      reader.onload = () => setReceiptBase64(reader.result as string)
                      reader.readAsDataURL(file)
                    }}
                  />
                  <span style={{ fontSize: 20 }}>📎</span>
                  <span style={{ fontSize: 13, color: receiptName ? 'var(--text)' : 'var(--muted)' }}>
                    {receiptName ?? 'Прикріпити файл (зображення або PDF)'}
                  </span>
                  {receiptName && (
                    <button
                      type="button"
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}
                      onClick={(e) => { e.preventDefault(); setReceiptBase64(null); setReceiptName(null) }}
                    >✕</button>
                  )}
                </label>
              </div>
            </div>
            <div className="ui-modal__footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setPaymentModal(null)} disabled={paymentSubmitting}>Скасувати</Button>
              <Button variant="primary" size="sm" disabled={paymentSubmitting} onClick={() => void submitPayment()}>
                {paymentSubmitting ? 'Збереження…' : 'Зберегти'}
              </Button>
            </div>
          </div>
        </div>
      )}
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
