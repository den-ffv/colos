import { useEffect, useMemo, useState } from 'react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiGetJson, apiPostJson, apiPutJson, apiPatchJson, type ApiError } from '../../lib/api'
import type { ApiListResponse, ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { Badge } from '../../ui/Badge'
import './users.css'

/* ─── types ───────────────────────────────────────────── */

type UserRole = 'ADMIN' | 'MANAGER' | 'DISPATCHER' | 'ACCOUNTANT' | 'LOGIST' | 'DRIVER'

type UserRecord = {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  roles: UserRole[]
  driverProfile: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

type DriverOption = {
  id: string
  firstName: string
  lastName: string
  userId: string | null
}

type Pagination = { page: number; limit: number; total: number; totalPages: number }

const ALL_ROLES: UserRole[] = ['ADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'LOGIST', 'DRIVER']

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Адмін',
  MANAGER: 'Менеджер',
  DISPATCHER: 'Диспетчер',
  ACCOUNTANT: 'Бухгалтер',
  LOGIST: 'Логіст',
  DRIVER: 'Водій',
}

const ROLE_VARIANT: Record<UserRole, 'accent' | 'warning' | 'neutral' | 'success' | 'danger'> = {
  ADMIN: 'danger',
  MANAGER: 'accent',
  DISPATCHER: 'neutral',
  ACCOUNTANT: 'warning',
  LOGIST: 'success',
  DRIVER: 'neutral',
}

/* ─── helpers ─────────────────────────────────────────── */

function isSuccess<T>(res: ApiResponse<T>): res is { success: true; data: T } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

function isListSuccess<T>(res: ApiListResponse<T>): res is { success: true; data: T[]; pagination: Pagination } {
  return !!res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true
}

/* ─── component ───────────────────────────────────────── */

export function UsersPage({ tokens, onUnauthorized }: { tokens: AuthTokens; onUnauthorized: () => void }) {
  const authH = useMemo(
    () => ({ Authorization: `Bearer ${tokens.accessToken}` }),
    [tokens.accessToken],
  )

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const [data, setData] = useState<UserRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit, total: 0, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ─── drawer ──────────────────────────────────────── */
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    roles: [] as UserRole[],
    driverId: '',
  })

  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [driversLoading, setDriversLoading] = useState(false)

  /* ─── confirm deactivate ──────────────────────────── */
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)

  /* ─── query ───────────────────────────────────────── */
  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', String(limit))
    if (q.trim()) p.set('search', q.trim())
    return p.toString()
  }, [page, limit, q])

  async function loadList() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiGetJson<ApiListResponse<UserRecord>>(`/api/users?${query}`, { headers: authH })
      if (isListSuccess(res)) {
        setData(res.data)
        setPagination(res.pagination)
      } else {
        setError((res as { message?: string }).message ?? 'Помилка завантаження')
      }
    } catch (err) {
      const e = err as Partial<ApiError>
      if (e.status === 401) onUnauthorized()
      setError(e.message ?? 'Не вдалося завантажити список')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadList() }, [query, tokens.accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── load drivers for dropdown ──────────────────── */
  useEffect(() => {
    if (!drawerOpen || !form.roles.includes('DRIVER')) {
      setDrivers([])
      return
    }
    setDriversLoading(true)
    apiGetJson<ApiListResponse<DriverOption>>('/api/drivers?limit=500', { headers: authH })
      .then((res) => {
        if (isListSuccess(res)) {
          // Show drivers with no account OR the one already linked to this user
          setDrivers(res.data.filter((d) => !d.userId || d.id === editTarget?.driverProfile?.id))
        }
      })
      .catch(() => setDrivers([]))
      .finally(() => setDriversLoading(false))
  }, [drawerOpen, form.roles, editTarget, authH])

  /* ─── open drawer ─────────────────────────────────── */
  function openCreate() {
    setEditMode('create')
    setEditTarget(null)
    setForm({ firstName: '', lastName: '', email: '', password: '', roles: [], driverId: '' })
    setFormError(null)
    setDrawerOpen(true)
  }

  function openEdit(u: UserRecord) {
    setEditMode('edit')
    setEditTarget(u)
    setForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      password: '',
      roles: u.roles,
      driverId: u.driverProfile?.id ?? '',
    })
    setFormError(null)
    setDrawerOpen(true)
  }

  function toggleRole(role: UserRole) {
    setForm((f) => {
      const next = f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role]
      return { ...f, roles: next, driverId: role === 'DRIVER' && f.roles.includes('DRIVER') ? '' : f.driverId }
    })
  }

  /* ─── submit ──────────────────────────────────────── */
  async function handleSubmit() {
    if (form.roles.length === 0) { setFormError('Оберіть хоча б одну роль'); return }
    if (!editMode || (editMode === 'create' && form.password.length < 6)) {
      if (editMode === 'create') { setFormError('Пароль — мінімум 6 символів'); return }
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const body = {
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        roles: form.roles,
        ...(form.roles.includes('DRIVER')
          ? { driverId: form.driverId || null }
          : { driverId: null }),
        ...(editMode === 'create' ? { password: form.password } : form.password ? { password: form.password } : {}),
      }
      if (editMode === 'create') {
        await apiPostJson<ApiResponse<UserRecord>>('/api/users', body, { headers: authH })
      } else {
        await apiPutJson<ApiResponse<UserRecord>>(`/api/users/${editTarget!.id}`, body, { headers: authH })
      }
      setDrawerOpen(false)
      void loadList()
    } catch (err) {
      const e = err as Partial<ApiError>
      if (e.status === 401) onUnauthorized()
      setFormError(e.message ?? 'Помилка збереження')
    } finally {
      setSubmitting(false)
    }
  }

  /* ─── toggle status ───────────────────────────────── */
  async function handleToggleStatus() {
    if (!confirmId) return
    setConfirmSubmitting(true)
    try {
      await apiPatchJson<ApiResponse<UserRecord>>(`/api/users/${confirmId}/status`, {}, { headers: authH })
      setConfirmId(null)
      void loadList()
    } catch (err) {
      const e = err as Partial<ApiError>
      if (e.status === 401) onUnauthorized()
      setError(e.message ?? 'Помилка зміни статусу')
      setConfirmId(null)
    } finally {
      setConfirmSubmitting(false)
    }
  }

  const confirmTarget = data.find((u) => u.id === confirmId)
  const showDriverWarning =
    editMode === 'edit' && !!editTarget?.driverProfile && !form.roles.includes('DRIVER')

  /* ─── render ──────────────────────────────────────── */
  return (
    <div className="users">
      {/* header */}
      <div className="users__head">
        <div>
          <h1 className="users__h">Співробітники</h1>
          <div className="users__sub">{pagination.total} записів</div>
        </div>
        <div className="users__actions">
          <input
            className="ui-input users__search"
            placeholder="Пошук…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
          />
          <Button variant="primary" size="sm" onClick={openCreate}>
            + Створити
          </Button>
        </div>
      </div>

      {error && <div className="users__error">{error}</div>}

      {/* table */}
      <Card>
        <div className="users__tableWrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Email</th>
                <th>Ролі</th>
                <th>Водій</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="users__empty">Завантаження…</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="users__empty">Співробітників не знайдено</td>
                </tr>
              ) : data.map((u) => (
                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(u)}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>
                    <div className="users__roles">
                      {u.roles.map((r) => (
                        <Badge key={r} variant={ROLE_VARIANT[r]}>{ROLE_LABELS[r]}</Badge>
                      ))}
                    </div>
                  </td>
                  <td>
                    {u.driverProfile
                      ? `${u.driverProfile.firstName} ${u.driverProfile.lastName}`
                      : '—'}
                  </td>
                  <td>
                    <span className={u.isActive ? 'users__status--active' : 'users__status--inactive'}>
                      {u.isActive ? 'Активний' : 'Неактивний'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(u.id)}
                    >
                      {u.isActive ? 'Деакт.' : 'Акт.'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="users__pager">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Попередня</Button>
            <span className="users__page">Стор. {page} / {pagination.totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Наступна →</Button>
          </div>
        )}
      </Card>

      {/* confirm dialog */}
      {confirmId && confirmTarget && (
        <div className="ui-modal__overlay" onMouseDown={() => setConfirmId(null)}>
          <div className="ui-modal ui-card" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="ui-modal__head">
              <div className="ui-modal__title">Підтвердження</div>
            </div>
            <div className="ui-modal__body" style={{ fontSize: 14 }}>
              {confirmTarget.isActive
                ? `Деактивувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`
                : `Активувати ${confirmTarget.firstName} ${confirmTarget.lastName}?`}
            </div>
            <div className="ui-modal__footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setConfirmId(null)}>Скасувати</Button>
              <Button variant="primary" size="sm" disabled={confirmSubmitting} onClick={handleToggleStatus}>
                {confirmSubmitting ? '…' : 'Підтвердити'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* drawer */}
      <Drawer
        open={drawerOpen}
        title={editMode === 'create' ? 'Новий співробітник' : `${editTarget?.firstName} ${editTarget?.lastName}`}
        subtitle={editMode === 'edit' ? editTarget?.email : undefined}
        onClose={() => setDrawerOpen(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(false)} disabled={submitting}>
              Скасувати
            </Button>
            <Button variant="primary" size="sm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Збереження…' : editMode === 'create' ? 'Створити' : 'Зберегти'}
            </Button>
          </div>
        }
      >
        {formError && <div className="users__error" style={{ marginBottom: 12 }}>{formError}</div>}

        <div className="users__form">
          {showDriverWarning && (
            <div className="users__warning">
              Роль DRIVER знято, але водій{' '}
              {editTarget!.driverProfile!.firstName} {editTarget!.driverProfile!.lastName}{' '}
              залишається прив'язаним.
            </div>
          )}

          <label className="users__field">
            <span className="users__label">Ім'я *</span>
            <input
              className="ui-input"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </label>

          <label className="users__field">
            <span className="users__label">Прізвище *</span>
            <input
              className="ui-input"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </label>

          <label className="users__field users__field--full">
            <span className="users__label">Email *</span>
            <input
              className="ui-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>

          <label className="users__field users__field--full">
            <span className="users__label">
              Пароль{editMode === 'edit' ? ' (порожньо = не змінювати)' : ' *'}
            </span>
            <input
              className="ui-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              minLength={6}
            />
          </label>

          <div className="users__field users__field--full">
            <span className="users__label">Ролі *</span>
            <div className="users__checkboxes">
              {ALL_ROLES.map((role) => (
                <label key={role} className="users__checkbox">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </div>

          {form.roles.includes('DRIVER') && (
            <label className="users__field users__field--full">
              <span className="users__label">
                Прив'язати до водія{driversLoading ? ' (завантаження…)' : ''}
              </span>
              <select
                className="ui-input"
                value={form.driverId}
                onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
              >
                <option value="">— не прив'язувати —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName} {d.lastName}
                    {d.id === editTarget?.driverProfile?.id ? ' (поточний)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Drawer>
    </div>
  )
}
