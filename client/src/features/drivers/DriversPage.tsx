import { useEffect, useMemo, useState, useCallback } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { tryGetRolesFromJwt } from '../crm/jwt'
import './drivers.css'

/* ─── types ───────────────────────────────────────────── */

type Driver = {
  id: string
  firstName: string
  lastName: string
  phone: string
  licenseNumber: string
  payType: DriverPayType
  payRate: number
  isAvailable: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

type DriverPayType = 'PER_KM' | 'PER_HOUR' | 'PER_DAY' | 'FIXED'

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

const PHONE_RE = /^[+\d][\d\s\-()[\]]{4,18}[\d)]?$/
const LICENSE_RE = /^[A-Z]{2}-\d{4}$/

const PAY_TYPE_LABELS: Record<DriverPayType, string> = {
  PER_KM: 'За км',
  PER_HOUR: 'За годину',
  PER_DAY: 'За день',
  FIXED: 'Фіксовано',
}

const PAY_TYPE_UNITS: Record<DriverPayType, string> = {
  PER_KM: 'грн/км',
  PER_HOUR: 'грн/год',
  PER_DAY: 'грн/день',
  FIXED: 'грн/рейс',
}

function validateDriverForm(f: DriverForm): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!f.lastName.trim()) errors.lastName = 'Обовʼязкове поле'
  if (!f.firstName.trim()) errors.firstName = 'Обовʼязкове поле'

  const phone = f.phone.trim()
  if (!phone) errors.phone = 'Обовʼязкове поле'
  else if (!PHONE_RE.test(phone)) errors.phone = 'Невірний формат (напр. +380671234567)'

  const license = f.licenseNumber.trim().toUpperCase()
  if (!license) errors.licenseNumber = 'Обовʼязкове поле'
  else if (!LICENSE_RE.test(license)) errors.licenseNumber = 'Формат AA-1111'

  if (!f.payType) errors.payType = 'Обовʼязкове поле'
  const payRate = f.payRate.trim()
  if (!payRate) errors.payRate = 'Обовʼязкове поле'
  else if (Number(payRate) <= 0 || Number.isNaN(Number(payRate))) errors.payRate = 'Ставка має бути > 0'

  return errors
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  licenseNumber: '',
  payType: 'PER_KM' as DriverPayType,
  payRate: '',
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
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

  useEffect(() => {
    if (!Object.keys(touched).length) return
    const errors = validateDriverForm(form)
    const next: Record<string, string> = {}
    for (const key of Object.keys(touched)) {
      if (touched[key] && errors[key]) next[key] = errors[key]
    }
    setFieldErrors(next)
  }, [form, touched])

  function touchField(key: keyof DriverForm) {
    setTouched((s) => ({ ...s, [key]: true }))
  }

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
    setFieldErrors({})
    setTouched({})
    setEditOpen(true)
  }

  function openEdit() {
    if (!details) return
    setEditMode('edit')
    setForm({
      firstName: details.firstName,
      lastName: details.lastName,
      phone: details.phone,
      licenseNumber: details.licenseNumber.toUpperCase(),
      payType: details.payType,
      payRate: details.payRate.toString(),
      isAvailable: details.isAvailable,
      notes: details.notes ?? '',
    })
    setFormError(null)
    setFieldErrors({})
    setTouched({})
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
    const errors = validateDriverForm(form)
    if (Object.keys(errors).length) {
      setTouched((s) => ({
        ...s,
        ...Object.keys(errors).reduce((acc, key) => {
          acc[key] = true
          return acc
        }, {} as Record<string, boolean>),
      }))
      setFieldErrors(errors)
      setFormError(null)
      return
    }

    setFieldErrors({})
    setFormError(null)
    setFormSubmitting(true)
    try {
      const trimmedPhone = form.phone.trim()
      const trimmedLicense = form.licenseNumber.trim().toUpperCase()
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: trimmedPhone,
        licenseNumber: trimmedLicense,
        payType: form.payType,
        payRate: Number(form.payRate),
        isAvailable: form.isAvailable,
        notes: emptyToNull(form.notes),
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
              <KV k="Тип оплати" v={PAY_TYPE_LABELS[details.payType]} />
              <KV k="Ставка" v={`${details.payRate} ${PAY_TYPE_UNITS[details.payType]}`} />
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

      <Drawer
        open={editOpen}
        title={editMode === 'create' ? 'Новий водій' : 'Редагування водія'}
        subtitle={editMode === 'create' ? 'Заповніть інформацію про водія' : `${form.firstName} ${form.lastName}`}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button type="button" className="drawer-btn drawer-btn--ghost" onClick={() => setEditOpen(false)} disabled={formSubmitting}>
              Скасувати
            </button>
            <button type="button" className="drawer-btn drawer-btn--primary" onClick={() => void submitForm()} disabled={formSubmitting}>
              {formSubmitting ? 'Збереження…' : editMode === 'create' ? 'Додати водія' : 'Зберегти зміни'}
            </button>
          </>
        }
      >
        <div className="drawer-form">
          {formError && <div className="drawer-form__error">{formError}</div>}

          <div className="drawer-form__section">Особисті дані</div>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Прізвище</span>
              <input
                className="drawer-form__input"
                placeholder="Шевченко"
                value={form.lastName}
                onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
                onBlur={() => touchField('lastName')}
              />
              {fieldErrors.lastName && <span className="drivers__fieldError">{fieldErrors.lastName}</span>}
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Імʼя</span>
              <input
                className="drawer-form__input"
                placeholder="Тарас"
                value={form.firstName}
                onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
                onBlur={() => touchField('firstName')}
              />
              {fieldErrors.firstName && <span className="drivers__fieldError">{fieldErrors.firstName}</span>}
            </label>
          </div>

          <label className="drawer-form__field">
            <span className="drawer-form__label drawer-form__label--required">Телефон</span>
            <input
              className="drawer-form__input"
              placeholder="+380 XX XXX XX XX"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
              onBlur={() => touchField('phone')}
            />
            {fieldErrors.phone && <span className="drivers__fieldError">{fieldErrors.phone}</span>}
          </label>

          <div className="drawer-form__section">Документи</div>

          <label className="drawer-form__field">
            <span className="drawer-form__label drawer-form__label--required">Номер ліцензії</span>
            <input
              className="drawer-form__input"
              placeholder="AA-1111"
              value={form.licenseNumber}
              onChange={(e) => setForm((s) => ({ ...s, licenseNumber: e.target.value.toUpperCase() }))}
              onBlur={() => touchField('licenseNumber')}
            />
            {fieldErrors.licenseNumber && <span className="drivers__fieldError">{fieldErrors.licenseNumber}</span>}
          </label>

          <div className="drawer-form__section">Оплата</div>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Тип оплати</span>
              <select
                className="drawer-form__input"
                value={form.payType}
                onChange={(e) => { setForm((s) => ({ ...s, payType: e.target.value as DriverPayType })); touchField('payType') }}
              >
                {(Object.keys(PAY_TYPE_LABELS) as DriverPayType[]).map((t) => (
                  <option key={t} value={t}>{PAY_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {fieldErrors.payType && <span className="drivers__fieldError">{fieldErrors.payType}</span>}
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Ставка</span>
              <input
                className="drawer-form__input"
                type="number"
                step="0.1"
                min="0"
                placeholder="8"
                value={form.payRate}
                onChange={(e) => setForm((s) => ({ ...s, payRate: e.target.value }))}
                onBlur={() => touchField('payRate')}
              />
              <span className="drawer-form__hint">{PAY_TYPE_UNITS[form.payType]}</span>
              {fieldErrors.payRate && <span className="drivers__fieldError">{fieldErrors.payRate}</span>}
            </label>
          </div>

          <div className="drawer-form__section">Статус</div>

          <div className="drawer-form__toggle">
            <div className="drawer-form__toggleLabel">
              <span className="drawer-form__toggleTitle">Доступний для призначення</span>
              <span className="drawer-form__toggleHint">Водій може отримувати нові замовлення</span>
            </div>
            <label className="drawer-form__switch">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((s) => ({ ...s, isAvailable: e.target.checked }))}
              />
              <span className="drawer-form__switchTrack" />
            </label>
          </div>

          <div className="drawer-form__section">Додатково</div>

          <label className="drawer-form__field">
            <span className="drawer-form__label">Нотатки</span>
            <textarea
              className="drawer-form__input"
              rows={3}
              placeholder="Будь-які додаткові відомості…"
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </label>
        </div>
      </Drawer>
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
