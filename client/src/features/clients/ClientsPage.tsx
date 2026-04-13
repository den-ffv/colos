import { useEffect, useMemo, useState } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { tryGetRolesFromJwt } from '../crm/jwt'
import './clients.css'

type Client = {
  id: string
  companyName: string
  contactPerson: string
  phone: string
  email?: string
  address?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

type ClientOrder = {
  id: string
  orderNumber: string
  status: string
  executionType: string
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  totalCost: number
  clientPrice: number
  margin: number
  marginPercent: number
  createdAt: string
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

function isSuccess<T>(res: ApiResponse<T>): res is { success: true; data: T } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

function isListSuccess<T>(res: ApiListResponse<T>): res is { success: true; data: T[]; pagination: Pagination } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function emptyToNull(v: string) {
  const s = v.trim()
  return s ? s : null
}

export function ClientsPage({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const canDelete = roles.includes('ADMIN')

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<Client[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Client | null>(null)
  const [orders, setOrders] = useState<ClientOrder[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formSubmitting, setFormSubmitting] = useState(false)

  const PHONE_RE = /^[+\d][\d\s\-()\[\]]{4,18}[\d)]?$/

  function validateClientForm(f: typeof form): Record<string, string> {
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

    if (f.address.trim().length > 500) errors.address = 'Максимум 500 символів'
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
      const res = await apiGetJson<ApiListResponse<Client>>(`/api/clients?${query}`, {
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
      setError(apiErr.message ?? 'Не вдалося завантажити клієнтів')
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
      const [clientRes, ordersRes] = await Promise.all([
        apiGetJson<ApiResponse<Client>>(`/api/clients/${id}`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } }),
        apiGetJson<ApiListResponse<ClientOrder>>(`/api/clients/${id}/orders?page=1&limit=10`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ])

      if (isSuccess(clientRes)) setDetails(clientRes.data)
      else setDetailsError(clientRes.message)

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
    setForm({ companyName: '', contactPerson: '', phone: '', email: '', address: '', notes: '' })
    setFormError(null)
    setFieldErrors({})
    setEditOpen(true)
  }

  function openEdit() {
    if (!details) return
    setEditMode('edit')
    setForm({
      companyName: details.companyName ?? '',
      contactPerson: details.contactPerson ?? '',
      phone: details.phone ?? '',
      email: details.email ?? '',
      address: details.address ?? '',
      notes: details.notes ?? '',
    })
    setFormError(null)
    setFieldErrors({})
    setEditOpen(true)
  }

  async function submitForm() {
    const errors = validateClientForm(form)
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
        address: emptyToNull(form.address),
        notes: emptyToNull(form.notes),
      }

      if (editMode === 'create') {
        const res = await apiPostJson<ApiResponse<Client>>('/api/clients', payload, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        if (!isSuccess(res)) throw new Error(res.message)
        setEditOpen(false)
        await loadList()
        await openDetails(res.data.id)
      } else {
        if (!selectedId) return
        const res = await apiPutJson<ApiResponse<Client>>(`/api/clients/${selectedId}`, payload, {
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

  async function deleteClient() {
    if (!selectedId || !canDelete) return
    const confirmed = window.confirm('Видалити клієнта?')
    if (!confirmed) return
    try {
      await apiDeleteJson<ApiResponse<{ ok: true }>>(`/api/clients/${selectedId}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      setSelectedId(null)
      setDetails(null)
      await loadList()
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося видалити клієнта')
    }
  }

  return (
    <div className="clients">
      <div className="clients__head">
        <div className="clients__title">
          <h3 className="clients__h">Clients</h3>
          <div className="clients__sub">Пошук, створення, редагування</div>
        </div>
        <div className="clients__actions">
          <input
            className="ui-input clients__search"
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

      {error ? <div className="clients__error">{error}</div> : null}

      <div className="clients__grid">
        <Card title="Список" subtitle={`${pagination.total} клієнтів`}>
          <div className="clients__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Updated</th>
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
                      <td>{c.email ?? '—'}</td>
                      <td>{formatDate(c.updatedAt)}</td>
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

          <div className="clients__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Prev
            </Button>
            <div className="clients__page">
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
          subtitle={selectedId ? selectedId : 'Вибери клієнта'}
          right={
            selectedId ? (
              <div className="clients__detailActions">
                <Button size="sm" variant="secondary" onClick={openEdit} disabled={!details || detailsLoading}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={deleteClient} disabled={!canDelete || detailsLoading}>
                  Delete
                </Button>
              </div>
            ) : null
          }
        >
          {detailsError ? <div className="clients__error">{detailsError}</div> : null}
          {detailsLoading ? (
            <div>Loading…</div>
          ) : details ? (
            <div className="clients__details">
              <div className="clients__kv">
                <div className="clients__k">Company</div>
                <div className="clients__v">{details.companyName}</div>
              </div>
              <div className="clients__kv">
                <div className="clients__k">Contact</div>
                <div className="clients__v">{details.contactPerson}</div>
              </div>
              <div className="clients__kv">
                <div className="clients__k">Phone</div>
                <div className="clients__v">{details.phone}</div>
              </div>
              <div className="clients__kv">
                <div className="clients__k">Email</div>
                <div className="clients__v">{details.email ?? '—'}</div>
              </div>
              <div className="clients__kv">
                <div className="clients__k">Address</div>
                <div className="clients__v">{details.address ?? '—'}</div>
              </div>
              <div className="clients__kv">
                <div className="clients__k">Notes</div>
                <div className="clients__v">{details.notes ?? '—'}</div>
              </div>

              <div className="clients__sectionTitle">Останні замовлення</div>
              {orders.length ? (
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Status</th>
                      <th>Pickup</th>
                      <th>Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderNumber}</td>
                        <td>{o.status}</td>
                        <td>{formatDate(o.pickupDate)}</td>
                        <td>{o.deliveryDate ? formatDate(o.deliveryDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="clients__emptySmall">Нема замовлень</div>
              )}
            </div>
          ) : (
            <div className="clients__empty">Click a row in the list</div>
          )}
        </Card>
      </div>

      <Drawer
        open={editOpen}
        title={editMode === 'create' ? 'New client' : 'Edit client'}
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
        {formError ? <div className="clients__error">{formError}</div> : null}
        <div className="clients__form">
          <label className="clients__field">
            <span className="clients__label">Company *</span>
            <input className="ui-input" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} />
            {fieldErrors.companyName && <span className="clients__fieldError">{fieldErrors.companyName}</span>}
          </label>
          <label className="clients__field">
            <span className="clients__label">Contact *</span>
            <input className="ui-input" value={form.contactPerson} onChange={(e) => setForm((s) => ({ ...s, contactPerson: e.target.value }))} />
            {fieldErrors.contactPerson && <span className="clients__fieldError">{fieldErrors.contactPerson}</span>}
          </label>
          <label className="clients__field">
            <span className="clients__label">Phone *</span>
            <input className="ui-input" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
            {fieldErrors.phone && <span className="clients__fieldError">{fieldErrors.phone}</span>}
          </label>
          <label className="clients__field">
            <span className="clients__label">Email</span>
            <input className="ui-input" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            {fieldErrors.email && <span className="clients__fieldError">{fieldErrors.email}</span>}
          </label>
          <label className="clients__field">
            <span className="clients__label">Address</span>
            <input className="ui-input" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
            {fieldErrors.address && <span className="clients__fieldError">{fieldErrors.address}</span>}
          </label>
          <label className="clients__field">
            <span className="clients__label">Notes</span>
            <textarea
              className="ui-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
            />
            {fieldErrors.notes && <span className="clients__fieldError">{fieldErrors.notes}</span>}
          </label>
        </div>
      </Drawer>
    </div>
  )
}
