import { useEffect, useMemo, useState, useCallback } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { tryGetRolesFromJwt } from '../crm/jwt'
import './vehicles.css'

/* ─── types ───────────────────────────────────────────── */

type VehicleType = 'TRUCK' | 'VAN' | 'CAR' | 'REFRIGERATOR'
type FuelType = 'DIESEL' | 'PETROL_95' | 'PETROL_92' | 'GAS'

type Vehicle = {
  id: string
  plateNumber: string
  type: VehicleType
  capacity: number
  fuelType?: FuelType
  tankCapacity?: number
  fuelConsumption?: number
  cargoVolume?: number
  costPerKm?: number
  maxRange?: number
  isAvailable: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

type VehicleOrder = {
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

/* ─── constants ───────────────────────────────────────── */

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TRUCK: 'Вантажівка',
  VAN: 'Фургон',
  CAR: 'Легковий',
  REFRIGERATOR: 'Рефрижератор',
}

const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  DIESEL: 'Дизель',
  PETROL_95: 'А-95',
  PETROL_92: 'А-92',
  GAS: 'Газ (LPG)',
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
function emptyToNull(v: string) {
  const s = v.trim()
  return s || null
}

const EMPTY_FORM = {
  plateNumber: '',
  type: 'TRUCK' as VehicleType,
  capacity: '',
  fuelType: 'DIESEL' as FuelType,
  tankCapacity: '',
  fuelConsumption: '',
  cargoVolume: '',
  costPerKm: '',
  maxRange: '',
  isAvailable: true,
  notes: '',
}
type VehicleForm = typeof EMPTY_FORM

/* ─── component ───────────────────────────────────────── */

export function VehiclesPage({
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
  const [typeFilter, setTypeFilter] = useState<VehicleType | ''>('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<Vehicle[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Vehicle | null>(null)
  const [orders, setOrders] = useState<VehicleOrder[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [form, setForm] = useState<VehicleForm>({ ...EMPTY_FORM })
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    p.set('sortBy', 'plate_number')
    p.set('sortOrder', 'asc')
    if (q.trim()) p.set('q', q.trim())
    if (availFilter) p.set('available', availFilter)
    if (typeFilter) p.set('type', typeFilter)
    return p.toString()
  }, [page, limit, q, availFilter, typeFilter])

  const loadList = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<Vehicle>>(`/api/vehicles?${query}`, { headers: authHeaders })
      if (isListSuccess(res)) { setData(res.data); setPagination(res.pagination) }
      else setError(res.message)
    } catch (err) {
      const apiErr = err as Partial<ApiError>
      if (apiErr.status === 401) onUnauthorized()
      setError(apiErr.message ?? 'Не вдалося завантажити транспорт')
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
      const [vehRes, ordersRes] = await Promise.all([
        apiGetJson<ApiResponse<Vehicle>>(`/api/vehicles/${id}`, { headers: authHeaders }),
        apiGetJson<ApiListResponse<VehicleOrder>>(`/api/vehicles/${id}/orders?page=1&limit=10`, { headers: authHeaders }),
      ])
      if (isSuccess(vehRes)) setDetails(vehRes.data)
      else setDetailsError(vehRes.message)
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
      plateNumber: details.plateNumber,
      type: details.type,
      capacity: details.capacity.toString(),
      fuelType: details.fuelType ?? 'DIESEL',
      tankCapacity: details.tankCapacity?.toString() ?? '',
      fuelConsumption: details.fuelConsumption?.toString() ?? '',
      cargoVolume: details.cargoVolume?.toString() ?? '',
      costPerKm: details.costPerKm?.toString() ?? '',
      maxRange: details.maxRange?.toString() ?? '',
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
      const resp = await fetch(`${apiBase}/api/vehicles/${selectedId}/availability`, {
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
      const tankCapacity = form.tankCapacity.trim() ? Number(form.tankCapacity) : null
      const fuelConsumption = form.fuelConsumption.trim() ? Number(form.fuelConsumption) : null
      const cargoVolume = form.cargoVolume.trim() ? Number(form.cargoVolume) : null
      const costPerKm = form.costPerKm.trim() ? Number(form.costPerKm) : null
      const maxRange = form.maxRange.trim() ? Number(form.maxRange) : null

      const payload = {
        plateNumber: form.plateNumber.trim(),
        type: form.type,
        capacity: form.capacity ? Number(form.capacity) : null,
        fuelType: form.fuelType,
        tankCapacity,
        fuelConsumption,
        cargoVolume,
        costPerKm,
        maxRange,
        isAvailable: form.isAvailable,
        notes: emptyToNull(form.notes),
      }
      const invalidNumbers = [payload.capacity, tankCapacity, fuelConsumption, cargoVolume, costPerKm, maxRange]
        .some((v) => v === null || Number.isNaN(v))
      if (!payload.plateNumber || !payload.type || !payload.fuelType || invalidNumbers) {
        setFormError("Номерний знак, тип, паливо, технічні та економічні параметри обов'язкові")
        return
      }
      if (payload.capacity <= 0 || tankCapacity! <= 0 || fuelConsumption! <= 0 || cargoVolume! <= 0 || maxRange! <= 0 || costPerKm! < 0) {
        setFormError('Перевірте числові значення')
        return
      }
      if (editMode === 'create') {
        const res = await apiPostJson<ApiResponse<Vehicle>>('/api/vehicles', payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        setEditOpen(false)
        await loadList()
        await openDetails(res.data.id)
      } else {
        if (!selectedId) return
        const res = await apiPutJson<ApiResponse<Vehicle>>(`/api/vehicles/${selectedId}`, payload, { headers: authHeaders })
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

  async function deleteVehicle() {
    if (!selectedId || !canDelete) return
    if (!window.confirm('Видалити транспортний засіб?')) return
    try {
      await apiDeleteJson<ApiResponse<{ ok: true }>>(`/api/vehicles/${selectedId}`, { headers: authHeaders })
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
    <div className="vehicles">
      <div className="vehicles__head">
        <div>
          <h3 className="vehicles__h">Транспорт</h3>
          <div className="vehicles__sub">Управління транспортними засобами</div>
        </div>
        <div className="vehicles__actions">
          <input className="ui-input vehicles__search" placeholder="Пошук…" value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value) }} />
          <div className="vehicles__filters">
            <select className="vehicles__filterSelect" value={typeFilter}
              onChange={(e) => { setPage(1); setTypeFilter(e.target.value as VehicleType | '') }}>
              <option value="">Всі типи</option>
              {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
                <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select className="vehicles__filterSelect" value={availFilter}
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

      {error && <div className="vehicles__error">{error}</div>}

      <div className="vehicles__grid">
        <Card title="Список" subtitle={`${pagination.total} транспортних засобів`}>
          <div className="vehicles__tableWrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Тип</th>
                  <th>Вантажопідйомність</th>
                  <th>Доступність</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4}>Завантаження…</td></tr>
                ) : data.length ? (
                  data.map((v) => (
                    <tr key={v.id} onClick={() => void openDetails(v.id)}
                      style={{ cursor: 'pointer', background: selectedId === v.id ? 'var(--surface)' : undefined }}>
                      <td>{v.plateNumber}</td>
                      <td><span className="vehicles__typeBadge">{VEHICLE_TYPE_LABELS[v.type]}</span></td>
                      <td>{v.capacity} т</td>
                      <td>
                        <span className={`vehicles__availBadge vehicles__availBadge--${v.isAvailable ? 'yes' : 'no'}`}>
                          {v.isAvailable ? 'Доступний' : 'Зайнятий'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4}>Порожньо</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="vehicles__pager">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Назад</Button>
            <div className="vehicles__page">Сторінка {pagination.page} / {pagination.totalPages}</div>
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>Далі</Button>
          </div>
        </Card>

        <Card
          title="Деталі"
          subtitle={details ? `${details.plateNumber}` : 'Вибери ТЗ'}
          right={selectedId ? (
            <div className="vehicles__detailActions">
              <Button size="sm" variant="secondary" onClick={openEdit} disabled={!details || detailsLoading}>Редагувати</Button>
              <Button size="sm" variant="secondary" onClick={() => void toggleAvailability()} disabled={!details || detailsLoading}>
                {details?.isAvailable ? 'Зайнятий' : 'Доступний'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void deleteVehicle()} disabled={!canDelete || detailsLoading}>Видалити</Button>
            </div>
          ) : null}
        >
          {detailsError && <div className="vehicles__error">{detailsError}</div>}
          {detailsLoading ? <div>Завантаження…</div> : details ? (
            <div className="vehicles__details">
              <KV k="Номерний знак" v={details.plateNumber} />
              <KV k="Тип" v={<span className="vehicles__typeBadge">{VEHICLE_TYPE_LABELS[details.type]}</span>} />
              <KV k="Вантажопідйомність" v={`${details.capacity} т`} />
              <KV k="Пальне" v={details.fuelType ? FUEL_TYPE_LABELS[details.fuelType] : '—'} />
              <KV k="Обʼєм баку" v={details.tankCapacity !== undefined ? `${details.tankCapacity} л` : '—'} />
              <KV k="Витрата" v={details.fuelConsumption !== undefined ? `${details.fuelConsumption} л/100км` : '—'} />
              <KV k="Обʼєм кузова" v={details.cargoVolume !== undefined ? `${details.cargoVolume} м³` : '—'} />
              <KV k="Вартість/км" v={details.costPerKm !== undefined ? `${details.costPerKm} грн` : '—'} />
              <KV k="Запас ходу" v={details.maxRange !== undefined ? `${details.maxRange} км` : '—'} />
              <KV k="Доступність" v={
                <span className={`vehicles__availBadge vehicles__availBadge--${details.isAvailable ? 'yes' : 'no'}`}>
                  {details.isAvailable ? 'Доступний' : 'Зайнятий'}
                </span>
              } />
              {details.notes && <KV k="Нотатки" v={details.notes} />}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Створено: {formatDate(details.createdAt)} · Оновлено: {formatDate(details.updatedAt)}
              </div>

              <div className="vehicles__sectionTitle">Останні замовлення</div>
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
              ) : <div className="vehicles__empty">Немає замовлень</div>}
            </div>
          ) : <div className="vehicles__empty">Клікни рядок у списку</div>}
        </Card>
      </div>

      <Drawer
        open={editOpen}
        title={editMode === 'create' ? 'Новий транспортний засіб' : 'Редагування ТЗ'}
        subtitle={editMode === 'create' ? 'Додайте транспортний засіб до флоту' : `Редагування — ${form.plateNumber}`}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button type="button" className="drawer-btn drawer-btn--ghost" onClick={() => setEditOpen(false)} disabled={formSubmitting}>
              Скасувати
            </button>
            <button type="button" className="drawer-btn drawer-btn--primary" onClick={() => void submitForm()} disabled={formSubmitting}>
              {formSubmitting ? 'Збереження…' : editMode === 'create' ? 'Додати ТЗ' : 'Зберегти зміни'}
            </button>
          </>
        }
      >
        <div className="drawer-form">
          {formError && <div className="drawer-form__error">{formError}</div>}

          <div className="drawer-form__section">Ідентифікація</div>

          <label className="drawer-form__field">
            <span className="drawer-form__label drawer-form__label--required">Номерний знак</span>
            <input
              className="drawer-form__input"
              placeholder="AA 0000 AA"
              value={form.plateNumber}
              onChange={(e) => setForm((s) => ({ ...s, plateNumber: e.target.value }))}
            />
          </label>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Тип</span>
              <select
                className="drawer-form__input"
                value={form.type}
                onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as VehicleType }))}
              >
                {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
                  <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Вантажопідйомність (т)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="0.1"
                min="0"
                placeholder="20"
                value={form.capacity}
                onChange={(e) => setForm((s) => ({ ...s, capacity: e.target.value }))}
              />
            </label>
          </div>

          <div className="drawer-form__section">Паливо</div>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Тип пального</span>
              <select
                className="drawer-form__input"
                value={form.fuelType}
                onChange={(e) => setForm((s) => ({ ...s, fuelType: e.target.value as FuelType }))}
              >
                {(Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((t) => (
                  <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Обʼєм баку (л)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="1"
                min="0"
                placeholder="400"
                value={form.tankCapacity}
                onChange={(e) => setForm((s) => ({ ...s, tankCapacity: e.target.value }))}
              />
            </label>
          </div>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Витрата (л/100км)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="0.1"
                min="0"
                placeholder="28"
                value={form.fuelConsumption}
                onChange={(e) => setForm((s) => ({ ...s, fuelConsumption: e.target.value }))}
              />
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Обʼєм кузова (м³)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="0.1"
                min="0"
                placeholder="60"
                value={form.cargoVolume}
                onChange={(e) => setForm((s) => ({ ...s, cargoVolume: e.target.value }))}
              />
            </label>
          </div>

          <div className="drawer-form__section">Економіка</div>

          <div className="drawer-form__row">
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Вартість/км (грн)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="0.1"
                min="0"
                placeholder="8"
                value={form.costPerKm}
                onChange={(e) => setForm((s) => ({ ...s, costPerKm: e.target.value }))}
              />
            </label>
            <label className="drawer-form__field">
              <span className="drawer-form__label drawer-form__label--required">Запас ходу (км)</span>
              <input
                className="drawer-form__input"
                type="number"
                step="1"
                min="0"
                placeholder="1200"
                value={form.maxRange}
                onChange={(e) => setForm((s) => ({ ...s, maxRange: e.target.value }))}
              />
            </label>
          </div>

          <div className="drawer-form__section">Статус</div>

          <div className="drawer-form__toggle">
            <div className="drawer-form__toggleLabel">
              <span className="drawer-form__toggleTitle">Доступний для призначення</span>
              <span className="drawer-form__toggleHint">ТЗ може отримувати нові замовлення</span>
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
    <div className="vehicles__kv">
      <div className="vehicles__k">{k}</div>
      <div className="vehicles__v">{v}</div>
    </div>
  )
}
