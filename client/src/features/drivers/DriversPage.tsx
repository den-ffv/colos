import { useEffect, useMemo, useState, useCallback } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Modal } from '../../ui/Modal'
import { tryGetRolesFromJwt } from '../crm/jwt'
import './drivers.css'

/* ─── types ───────────────────────────────────────────── */

type Driver = {
  id: string
  firstName: string
  lastName: string
  phone: string
  licenseNumber: string
  isAvailable: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

type DriverOrder = {
  id: string
  orderNumber: string
  status: string
  pickupAddress: string
  deliveryAddress: string
  pickupDate: string
  deliveryDate?: string
  createdAt: string
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

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
  return s || null
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  licenseNumber: '',
  isAvailable: true,
  notes: '',
}
type DriverForm = typeof EMPTY_FORM

/* ─── component ───────────────────────────────────────── */

export function DriversPage({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const canDelete = roles.includes('ADMIN')
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${tokens.accessToken}` }), [tokens.accessToken])

  const [q, setQ] = useState('')
  const [availFilter, setAvailFilter] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<Driver[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Driver | null>(null)
  const [orders, setOrders] = useState<DriverOrder[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<DriverForm>({ ...EMPTY_FORM })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    p.set('sortBy', 'last_name')
    p.set('sortOrder', 'asc')
    if (q.trim()) p.set('q', q.trim())
    if (availFilter) p.set('available', availFilter)
    return p.toString()
  }, [page, limit, q, availFilter])

  const loadList = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<Driver>>(`/api/drivers?${query}`, { headers: authHeaders })
      if (isListSuccess(res)) { setData(res.data); setPagination(res.pagination) }
      else setError(res.message)
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setError(apiErr.message ?? 'Не вдалося завантажити водіїв')
    } finally { setIsLoading(false) }
  }, [query, authHeaders, onUnauthorized])

  useEffect(() => { void loadList() }, [loadList])

  async function openDetails(id: string) {
    setSelectedId(id)
    setDetails(null)
    setOrders([])
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const [driverRes, ordersRes] = await Promise.all([
        apiGetJson<ApiResponse<Driver>>(`/api/drivers/${id}`, { headers: authHeaders }),
        apiGetJson<ApiListResponse<DriverOrder>>(`/api/drivers/${id}/orders?page=1&limit=10`, { headers: authHeaders }),
      ])
      if (isSuccess(driverRes)) setDetails(driverRes.data)
      else setDetailsError(driverRes.message)
      if (isListSuccess(ordersRes)) setOrders(ordersRes.data)
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося завантажити деталі')
    } finally { setDetailsLoading(false) }
  }

  function openCreate() {
    setEditMode('create')
    setForm({ ...EMPTY_FORM })
    setFormError(null)
    setEditOpen(true)
  }

  function openEdit() {
    if (!details) return
    setEditMode('edit')
    setForm({
      firstName: details.firstName,
      lastName: details.lastName,
      phone: details.phone,
      licenseNumber: details.licenseNumber,
      isAvailable: details.isAvailable,
      notes: details.notes ?? '',
    })
    setFormError(null)
    setEditOpen(true)
  }

  async function toggleAvailability() {
    if (!selectedId || !details) return
    try {
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000'
      const resp = await fetch(`${apiBase}/api/drivers/${selectedId}/availability`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !details.isAvailable }),
      })
      const body = await resp.json()
      if (!resp.ok) { setDetailsError(body.message ?? 'Помилка'); return }
      if (body.success) { setDetails(body.data); await loadList() }
    } catch { setDetailsError('Помилка зміни доступності') }
  }

  async function submitForm() {
    setFormError(null)
    setFormSubmitting(true)
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        licenseNumber: form.licenseNumber.trim(),
        isAvailable: form.isAvailable,
        notes: emptyToNull(form.notes),
      }
      if (!payload.firstName || !payload.lastName || !payload.phone || !payload.licenseNumber) {
        setFormError("Ім'я, прізвище, телефон та номер ліцензії обов'язкові")
        return
      }
      if (editMode === 'create') {
        const res = await apiPostJson<ApiResponse<Driver>>('/api/drivers', payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        setEditOpen(false)
        await loadList()
        await openDetails(res.data.id)
      } else {
        if (!selectedId) return
        const res = await apiPutJson<ApiResponse<Driver>>(`/api/drivers/${selectedId}`, payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        setEditOpen(false)
        setDetails(res.data)
        await loadList()
      }
    } catch (err) {
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : 'Помилка'
      setFormError(msg)
    } finally { setFormSubmitting(false) }
  }

  async function deleteDriver() {
    if (!selectedId || !canDelete) return
    if (!window.confirm('Видалити водія?')) return
    try {
      await apiDeleteJson<ApiResponse<{ ok: true }>>(`/api/drivers/${selectedId}`, { headers: authHeaders })
      setSelectedId(null)
      setDetails(null)
      await loadList()
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setDetailsError(apiErr.message ?? 'Не вдалося видалити')
    }
  }

  return (
    <div className="drivers">
      <div className="drivers__head">
        <div>
          <h3 className="drivers__h">Водії</h3>
          <div className="drivers__sub">Управління водіями компанії</div>
        </div>
        <div className="drivers__actions">
          <input className="ui-input drivers__search" placeholder="Пошук…" value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value) }} />
          <div className="drivers__filters">
            <select className="drivers__filterSelect" value={availFilter}
              onChange={(e) => { setPage(1); setAvailFilter(e.target.value as '' | 'true' | 'false') }}>
              <option value="">Всі</option>
              <option value="true">Доступні</option>
              <option value="false">Недоступні</option>
            </select>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void loadList()} disabled={isLoading}>Оновити</Button>
          <Button size="sm" variant="primary" onClick={openCreate}>+ Новий</Button>
        </div>
      </div>

      {error && <div className="drivers__error">{error}</div>}

      <div className="drivers__grid">
        <Card title="Список" subtitle={`${pagination.total} водіїв`}>
          <div className="drivers__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Прізвище</th>
                  <th>Імʼя</th>
                  <th>Телефон</th>
                  <th>Ліцензія</th>
                  <th>Доступність</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5}>Завантаження…</td></tr>
                ) : data.length ? (
                  data.map((d) => (
                    <tr key={d.id} onClick={() => void openDetails(d.id)}
                      style={{ cursor: 'pointer', background: selectedId === d.id ? 'var(--surface)' : undefined }}>
                      <td>{d.lastName}</td>
                      <td>{d.firstName}</td>
                      <td>{d.phone}</td>
                      <td>{d.licenseNumber}</td>
                      <td>
                        <span className={`drivers__availBadge drivers__availBadge--${d.isAvailable ? 'yes' : 'no'}`}>
                          {d.isAvailable ? 'Доступний' : 'Зайнятий'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5}>Порожньо</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="drivers__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Назад</Button>
            <div className="drivers__page">Сторінка {pagination.page} / {pagination.totalPages}</div>
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>Далі</Button>
          </div>
        </Card>

        <Card
          title="Деталі"
          subtitle={details ? `${details.firstName} ${details.lastName}` : 'Вибери водія'}
          right={selectedId ? (
            <div className="drivers__detailActions">
              <Button size="sm" variant="secondary" onClick={openEdit} disabled={!details || detailsLoading}>Редагувати</Button>
              <Button size="sm" variant="secondary" onClick={() => void toggleAvailability()} disabled={!details || detailsLoading}>
                {details?.isAvailable ? 'Зайнятий' : 'Доступний'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void deleteDriver()} disabled={!canDelete || detailsLoading}>Видалити</Button>
            </div>
          ) : null}
        >
          {detailsError && <div className="drivers__error">{detailsError}</div>}
          {detailsLoading ? <div>Завантаження…</div> : details ? (
            <div className="drivers__details">
              <KV k="Прізвище" v={details.lastName} />
              <KV k="Імʼя" v={details.firstName} />
              <KV k="Телефон" v={details.phone} />
              <KV k="Номер ліцензії" v={details.licenseNumber} />
              <KV k="Доступність" v={
                <span className={`drivers__availBadge drivers__availBadge--${details.isAvailable ? 'yes' : 'no'}`}>
                  {details.isAvailable ? 'Доступний' : 'Зайнятий'}
                </span>
              } />
              {details.notes && <KV k="Нотатки" v={details.notes} />}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Створено: {formatDate(details.createdAt)} · Оновлено: {formatDate(details.updatedAt)}
              </div>

              <div className="drivers__sectionTitle">Останні замовлення</div>
              {orders.length ? (
                <table className="ui-table">
                  <thead>
                    <tr><th>№</th><th>Статус</th><th>Звідки</th><th>Куди</th><th>Забір</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderNumber}</td>
                        <td>{o.status}</td>
                        <td>{o.pickupAddress}</td>
                        <td>{o.deliveryAddress}</td>
                        <td>{formatDate(o.pickupDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="drivers__empty">Немає замовлень</div>}
            </div>
          ) : <div className="drivers__empty">Клікни рядок у списку</div>}
        </Card>
      </div>

      <Modal
        open={editOpen}
        title={editMode === 'create' ? 'Новий водій' : 'Редагування водія'}
        onClose={() => setEditOpen(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={formSubmitting}>Скасувати</Button>
          <Button variant="primary" onClick={() => void submitForm()} disabled={formSubmitting}>
            {formSubmitting ? 'Збереження…' : 'Зберегти'}
          </Button>
        </>}
      >
        {formError && <div className="drivers__error">{formError}</div>}
        <div className="drivers__form">
          <label className="drivers__field">
            <span className="drivers__label">Прізвище *</span>
            <input className="ui-input" value={form.lastName} onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))} />
          </label>
          <label className="drivers__field">
            <span className="drivers__label">Імʼя *</span>
            <input className="ui-input" value={form.firstName} onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))} />
          </label>
          <label className="drivers__field">
            <span className="drivers__label">Телефон *</span>
            <input className="ui-input" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
          </label>
          <label className="drivers__field">
            <span className="drivers__label">Номер ліцензії *</span>
            <input className="ui-input" value={form.licenseNumber} onChange={(e) => setForm((s) => ({ ...s, licenseNumber: e.target.value }))} />
          </label>
          <label className="drivers__field">
            <span className="drivers__label">Доступний</span>
            <select className="ui-input" value={form.isAvailable ? 'true' : 'false'}
              onChange={(e) => setForm((s) => ({ ...s, isAvailable: e.target.value === 'true' }))}>
              <option value="true">Так</option>
              <option value="false">Ні</option>
            </select>
          </label>
          <label className="drivers__field drivers__field--full">
            <span className="drivers__label">Нотатки</span>
            <textarea className="ui-input" rows={3} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
          </label>
        </div>
      </Modal>
    </div>
  )
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="drivers__kv">
      <div className="drivers__k">{k}</div>
      <div className="drivers__v">{v}</div>
    </div>
  )
}
