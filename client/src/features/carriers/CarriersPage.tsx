import { useEffect, useMemo, useState } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { Badge } from '../../ui/Badge'
import { tryGetRolesFromJwt } from '../crm/jwt'
import './carriers.css'

/* ─── types ───────────────────────────────────────────── */

type VehicleType = 'TRUCK' | 'VAN' | 'CAR' | 'REFRIGERATOR'

type Carrier = {
  id: string
  companyName: string
  contactPerson: string
  phone: string
  email?: string
  vehicleTypes: VehicleType[]
  maxCapacity: number
  coverageAreas: string[]
  rating: number
  isAvailable: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

type CarrierOrder = {
  id: string
  orderNumber: string
  status: string
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  carrierAgreedPrice: number | null
  carrierPaid: boolean
  createdAt: string
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

const VEHICLE_TYPES: VehicleType[] = ['TRUCK', 'VAN', 'CAR', 'REFRIGERATOR']

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
function emptyToNull(v: string) {
  const s = v.trim()
  return s ? s : null
}
function ratingStars(r: number) {
  const full = Math.round(r)
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full))
}

/* ─── component ───────────────────────────────────────── */

export function CarriersPage({ tokens, onUnauthorized }: { tokens: AuthTokens; onUnauthorized: () => void }) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const canDelete = roles.includes('ADMIN')

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<Carrier[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Carrier | null>(null)
  const [orders, setOrders] = useState<CarrierOrder[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    vehicleTypes: [] as VehicleType[],
    maxCapacity: '',
    coverageAreas: '',
    rating: '5',
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formSubmitting, setFormSubmitting] = useState(false)

  const PHONE_RE = /^[+\d][\d\s\-()\[\]]{4,18}[\d)]?$/

  function validateCarrierForm(f: typeof form): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!f.companyName.trim()) errors.companyName = 'Обовʼязкове поле'
    else if (f.companyName.trim().length < 2) errors.companyName = 'Мінімум 2 символи'
    else if (f.companyName.trim().length > 200) errors.companyName = 'Максимум 200 символів'

    if (!f.contactPerson.trim()) errors.contactPerson = 'Обовʼязкове поле'
    else if (f.contactPerson.trim().length < 2) errors.contactPerson = 'Мінімум 2 символи'
    else if (f.contactPerson.trim().length > 200) errors.contactPerson = 'Максимум 200 символів'

    if (!f.phone.trim()) errors.phone = 'Обовʼязкове поле'
    else if (!PHONE_RE.test(f.phone.trim())) errors.phone = 'Невірний формат (напр. +380671234567)'

    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      errors.email = 'Невірний email'

    if (!f.maxCapacity.trim()) errors.maxCapacity = 'Обовʼязкове поле'
    else {
      const cap = Number(f.maxCapacity)
      if (!Number.isFinite(cap) || cap <= 0) errors.maxCapacity = 'Повинна бути > 0'
      else if (cap > 999) errors.maxCapacity = 'Максимум 999 т'
    }

    const rat = Number(f.rating)
    if (f.rating && (!Number.isFinite(rat) || rat < 0 || rat > 5))
      errors.rating = 'Від 0 до 5'

    if (f.notes.trim().length > 1000) errors.notes = 'Максимум 1000 символів'

    return errors
  }

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    p.set('sortBy', 'companyName')
    p.set('sortOrder', 'asc')
    if (q.trim()) p.set('q', q.trim())
    return p.toString()
  }, [page, limit, q])

  async function loadList() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<Carrier>>(`/api/carriers?${query}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (isListSuccess(res)) {
        setData(res.data)
        setPagination(res.pagination)
      } else {
        setError(res.message)
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setError(apiErr.message ?? 'Не вдалося завантажити перевізників')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tokens.accessToken])

  async function openDetails(id: string) {
    setSelectedId(id)
    setDetails(null)
    setOrders([])
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const [carrierRes, ordersRes] = await Promise.all([
        apiGetJson<ApiResponse<Carrier>>(`/api/carriers/${id}`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } }),
        apiGetJson<ApiListResponse<CarrierOrder>>(`/api/carriers/${id}/orders?page=1&limit=10`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ])
      if (isSuccess(carrierRes)) setDetails(carrierRes.data)
      else setDetailsError(carrierRes.message)
      if (isListSuccess(ordersRes)) setOrders(ordersRes.data)
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося завантажити деталі')
    } finally {
      setDetailsLoading(false)
    }
  }

  function openCreate() {
    setEditMode('create')
    setForm({ companyName: '', contactPerson: '', phone: '', email: '', vehicleTypes: [], maxCapacity: '', coverageAreas: '', rating: '5', notes: '' })
    setFormError(null)
    setFieldErrors({})
    setEditOpen(true)
  }

  function openEdit() {
    if (!details) return
    setEditMode('edit')
    setForm({
      companyName: details.companyName,
      contactPerson: details.contactPerson,
      phone: details.phone,
      email: details.email ?? '',
      vehicleTypes: details.vehicleTypes,
      maxCapacity: String(details.maxCapacity),
      coverageAreas: details.coverageAreas.join(', '),
      rating: String(details.rating),
      notes: details.notes ?? '',
    })
    setFormError(null)
    setFieldErrors({})
    setEditOpen(true)
  }

  function toggleVehicleType(t: VehicleType) {
    setForm((s) => ({
      ...s,
      vehicleTypes: s.vehicleTypes.includes(t) ? s.vehicleTypes.filter((x) => x !== t) : [...s.vehicleTypes, t],
    }))
  }

  async function submitForm() {
    const errors = validateCarrierForm(form)
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setFormError(null)
    setFormSubmitting(true)
    try {
      const payload = {
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        email: emptyToNull(form.email),
        vehicleTypes: form.vehicleTypes,
        maxCapacity: Number(form.maxCapacity),
        coverageAreas: form.coverageAreas
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        rating: Math.min(5, Math.max(0, Number(form.rating) || 5)),
        notes: emptyToNull(form.notes),
      }

      if (editMode === 'create') {
        const res = await apiPostJson<ApiResponse<Carrier>>('/api/carriers', payload, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (!isSuccess(res)) throw new Error(res.message)
        setEditOpen(false)
        await loadList()
        await openDetails(res.data.id)
      } else {
        if (!selectedId) return
        const res = await apiPutJson<ApiResponse<Carrier>>(`/api/carriers/${selectedId}`, payload, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (!isSuccess(res)) throw new Error(res.message)
        setEditOpen(false)
        setDetails(res.data)
        await loadList()
      }
    } catch (err) {
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Помилка'
      setFormError(msg)
    } finally {
      setFormSubmitting(false)
    }
  }

  async function toggleAvailability() {
    if (!selectedId || !details) return
    try {
      const res = await apiPatchJson<ApiResponse<Carrier>>(
        `/api/carriers/${selectedId}/availability`,
        { isAvailable: !details.isAvailable },
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      )
      if (isSuccess(res)) {
        setDetails(res.data)
        setData((prev) => prev.map((c) => (c.id === selectedId ? { ...c, isAvailable: res.data.isAvailable } : c)))
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
    }
  }

  async function deleteCarrier() {
    if (!selectedId || !canDelete) return
    const confirmed = window.confirm('Видалити перевізника?')
    if (!confirmed) return
    try {
      await apiDeleteJson<ApiResponse<{ ok: true }>>(`/api/carriers/${selectedId}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      setSelectedId(null)
      setDetails(null)
      await loadList()
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося видалити перевізника')
    }
  }

  return (
    <div className="carriers">
      <div className="carriers__head">
        <div className="carriers__title">
          <h3 className="carriers__h">Carriers</h3>
          <div className="carriers__sub">Зовнішні перевізники та партнери</div>
        </div>
        <div className="carriers__actions">
          <input
            className="ui-input carriers__search"
            placeholder="Search…"
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => void loadList()} disabled={isLoading}>
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={openCreate}>
            New
          </Button>
        </div>
      </div>

      {error ? <div className="carriers__error">{error}</div> : null}

      <div className="carriers__grid">
        <Card title="Список" subtitle={`${pagination.total} перевізників`}>
          <div className="carriers__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>Loading…</td>
                  </tr>
                ) : data.length ? (
                  data.map((c) => (
                    <tr key={c.id} onClick={() => void openDetails(c.id)} style={{ cursor: 'pointer' }}>
                      <td>{c.companyName}</td>
                      <td>{c.contactPerson}</td>
                      <td>{c.phone}</td>
                      <td className="carriers__stars">{ratingStars(c.rating)} {c.rating.toFixed(1)}</td>
                      <td>
                        <Badge variant={c.isAvailable ? 'success' : 'warning'}>
                          {c.isAvailable ? 'Available' : 'Busy'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Empty</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="carriers__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <div className="carriers__page">
              Page {pagination.page} / {pagination.totalPages}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </Card>

        <Card
          title="Деталі"
          subtitle={selectedId ? selectedId : 'Вибери перевізника'}
          right={
            selectedId ? (
              <div className="carriers__detailActions">
                <Button size="sm" variant="secondary" onClick={openEdit} disabled={!details || detailsLoading}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleAvailability()} disabled={!details || detailsLoading}>
                  {details?.isAvailable ? 'Set Busy' : 'Set Available'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteCarrier()} disabled={!canDelete || detailsLoading}>
                  Delete
                </Button>
              </div>
            ) : null
          }
        >
          {detailsError ? <div className="carriers__error">{detailsError}</div> : null}
          {detailsLoading ? (
            <div>Loading…</div>
          ) : details ? (
            <div className="carriers__details">
              <div className="carriers__kv">
                <div className="carriers__k">Company</div>
                <div className="carriers__v">{details.companyName}</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Contact</div>
                <div className="carriers__v">{details.contactPerson}</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Phone</div>
                <div className="carriers__v">{details.phone}</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Email</div>
                <div className="carriers__v">{details.email ?? '—'}</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Rating</div>
                <div className="carriers__v carriers__stars">{ratingStars(details.rating)} {details.rating.toFixed(1)}</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Max capacity</div>
                <div className="carriers__v">{details.maxCapacity} т</div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Vehicle types</div>
                <div className="carriers__v carriers__tags">
                  {details.vehicleTypes.length ? details.vehicleTypes.map((t) => <Badge key={t} variant="default">{t}</Badge>) : '—'}
                </div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Coverage</div>
                <div className="carriers__v carriers__tags">
                  {details.coverageAreas.length ? details.coverageAreas.map((a) => <Badge key={a} variant="default">{a}</Badge>) : '—'}
                </div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Status</div>
                <div className="carriers__v">
                  <Badge variant={details.isAvailable ? 'success' : 'warning'}>
                    {details.isAvailable ? 'Available' : 'Busy'}
                  </Badge>
                </div>
              </div>
              <div className="carriers__kv">
                <div className="carriers__k">Notes</div>
                <div className="carriers__v">{details.notes ?? '—'}</div>
              </div>

              <div className="carriers__sectionTitle">Останні замовлення</div>
              {orders.length ? (
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Status</th>
                      <th>Pickup</th>
                      <th>Price</th>
                      <th>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderNumber}</td>
                        <td>{o.status}</td>
                        <td>{formatDate(o.pickupDate)}</td>
                        <td>{o.carrierAgreedPrice ?? '—'}</td>
                        <td>{o.carrierPaid ? 'paid' : 'unpaid'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="carriers__emptySmall">Нема замовлень</div>
              )}
            </div>
          ) : (
            <div className="carriers__empty">Click a row in the list</div>
          )}
        </Card>
      </div>

      <Drawer
        open={editOpen}
        title={editMode === 'create' ? 'New carrier' : 'Edit carrier'}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submitForm()} disabled={formSubmitting}>
              Save
            </Button>
          </>
        }
      >
        {formError ? <div className="carriers__error">{formError}</div> : null}
        <div className="carriers__form">
          <label className="carriers__field">
            <span className="carriers__label">Company *</span>
            <input className="ui-input" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} />
            {fieldErrors.companyName && <span className="carriers__fieldError">{fieldErrors.companyName}</span>}
          </label>
          <label className="carriers__field">
            <span className="carriers__label">Contact *</span>
            <input className="ui-input" value={form.contactPerson} onChange={(e) => setForm((s) => ({ ...s, contactPerson: e.target.value }))} />
            {fieldErrors.contactPerson && <span className="carriers__fieldError">{fieldErrors.contactPerson}</span>}
          </label>
          <label className="carriers__field">
            <span className="carriers__label">Phone *</span>
            <input className="ui-input" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
            {fieldErrors.phone && <span className="carriers__fieldError">{fieldErrors.phone}</span>}
          </label>
          <label className="carriers__field">
            <span className="carriers__label">Email</span>
            <input className="ui-input" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            {fieldErrors.email && <span className="carriers__fieldError">{fieldErrors.email}</span>}
          </label>
          <label className="carriers__field">
            <span className="carriers__label">Max capacity (т) *</span>
            <input className="ui-input" type="number" min="0" max="999" value={form.maxCapacity} onChange={(e) => setForm((s) => ({ ...s, maxCapacity: e.target.value }))} />
            {fieldErrors.maxCapacity && <span className="carriers__fieldError">{fieldErrors.maxCapacity}</span>}
          </label>
          <label className="carriers__field">
            <span className="carriers__label">Rating (0–5)</span>
            <input className="ui-input" type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(e) => setForm((s) => ({ ...s, rating: e.target.value }))} />
            {fieldErrors.rating && <span className="carriers__fieldError">{fieldErrors.rating}</span>}
          </label>
          <div className="carriers__field carriers__field--full">
            <span className="carriers__label">Vehicle types</span>
            <div className="carriers__checkboxes">
              {VEHICLE_TYPES.map((t) => (
                <label key={t} className="carriers__checkbox">
                  <input type="checkbox" checked={form.vehicleTypes.includes(t)} onChange={() => toggleVehicleType(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <label className="carriers__field carriers__field--full">
            <span className="carriers__label">Coverage areas (через кому)</span>
            <input className="ui-input" value={form.coverageAreas} onChange={(e) => setForm((s) => ({ ...s, coverageAreas: e.target.value }))} placeholder="Київ-Львів, Одеса-Харків" />
          </label>
          <label className="carriers__field carriers__field--full">
            <span className="carriers__label">Notes</span>
            <textarea className="ui-input" rows={3} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
            {fieldErrors.notes && <span className="carriers__fieldError">{fieldErrors.notes}</span>}
          </label>
        </div>
      </Drawer>
    </div>
  )
}
