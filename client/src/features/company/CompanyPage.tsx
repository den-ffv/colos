import { useEffect, useMemo, useState } from 'react'
import './company.css'
import type { AuthTokens } from '../auth/auth.storage'
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import { isApiSuccess, type ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Drawer } from '../../ui/Drawer'
import { tryGetRolesFromJwt } from '../crm/jwt'

type OperationMode = 'OWN_FLEET' | 'BROKER' | 'HYBRID'

type Company = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  hasOwnFleet: boolean
  operationMode: OperationMode
  usesBrokerServices: boolean
  createdAt: string
  updatedAt: string
}

type CompanyAccount = {
  id: string
  name: string
  account: string
  is_active: boolean
  created_at: string
}

const OPERATION_MODE_LABELS: Record<OperationMode, string> = {
  OWN_FLEET: 'Власний флот',
  BROKER: 'Брокер',
  HYBRID: 'Гібрид',
}

export function CompanyPage({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens
  onUnauthorized: () => void
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken])
  const isAdmin = roles.includes('ADMIN')
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${tokens.accessToken}` }),
    [tokens.accessToken],
  )

  const [company, setCompany] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    hasOwnFleet: true,
    operationMode: 'HYBRID' as OperationMode,
    usesBrokerServices: true,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Bank accounts state ──
  const [accounts, setAccounts] = useState<CompanyAccount[]>([])
  const [accLoading, setAccLoading] = useState(false)
  const [accError, setAccError] = useState<string | null>(null)
  const [accDrawerOpen, setAccDrawerOpen] = useState(false)
  const [accEditTarget, setAccEditTarget] = useState<CompanyAccount | null>(null)
  const [accForm, setAccForm] = useState({ name: '', account: '' })
  const [accSaving, setAccSaving] = useState(false)
  const [accSaveError, setAccSaveError] = useState<string | null>(null)

  function loadAccounts() {
    setAccLoading(true)
    apiGetJson<ApiResponse<CompanyAccount[]>>('/api/company-accounts', { headers: authHeaders })
      .then((res) => { if (isApiSuccess(res)) setAccounts(res.data) })
      .catch((err: ApiError) => { if (err.status === 401) onUnauthorized(); else setAccError(err.message ?? 'Помилка') })
      .finally(() => setAccLoading(false))
  }

  function openAccDrawer(acc?: CompanyAccount) {
    setAccEditTarget(acc ?? null)
    setAccForm({ name: acc?.name ?? '', account: acc?.account ?? '' })
    setAccSaveError(null)
    setAccDrawerOpen(true)
  }

  async function saveAccount() {
    if (!accForm.name.trim() || !accForm.account.trim()) {
      setAccSaveError('Всі поля обов\'язкові')
      return
    }
    setAccSaving(true)
    setAccSaveError(null)
    try {
      if (accEditTarget) {
        await apiPutJson(`/api/company-accounts/${accEditTarget.id}`, accForm, { headers: authHeaders })
      } else {
        await apiPostJson('/api/company-accounts', accForm, { headers: authHeaders })
      }
      setAccDrawerOpen(false)
      loadAccounts()
    } catch (err) {
      setAccSaveError((err as ApiError).message ?? 'Помилка збереження')
    } finally {
      setAccSaving(false)
    }
  }

  async function toggleActive(acc: CompanyAccount) {
    try {
      await apiPutJson(`/api/company-accounts/${acc.id}`, { is_active: !acc.is_active }, { headers: authHeaders })
      loadAccounts()
    } catch { /* ignore */ }
  }

  async function deleteAccount(id: string) {
    if (!confirm('Видалити рахунок?')) return
    try {
      await apiDeleteJson(`/api/company-accounts/${id}`, { headers: authHeaders })
      loadAccounts()
    } catch { /* ignore */ }
  }

  function loadCompany() {
    setIsLoading(true)
    setError(null)
    apiGetJson<ApiResponse<Company>>('/api/companies/me', { headers: authHeaders })
      .then((res) => {
        if (isApiSuccess(res)) setCompany(res.data)
        else setError('Помилка завантаження даних компанії')
      })
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized()
        else setError(err.message ?? 'Помилка')
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    void loadCompany()
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openEdit() {
    if (!company) return
    setForm({
      name: company.name,
      email: company.email ?? '',
      phone: company.phone ?? '',
      address: company.address ?? '',
      hasOwnFleet: company.hasOwnFleet,
      operationMode: company.operationMode,
      usesBrokerServices: company.usesBrokerServices,
    })
    setSaveError(null)
    setEditOpen(true)
  }

  function handleSave() {
    setSaving(true)
    setSaveError(null)
    apiPutJson<ApiResponse<Company>>(
      '/api/companies/me',
      {
        name: form.name.trim() || undefined,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        hasOwnFleet: form.hasOwnFleet,
        operationMode: form.operationMode,
        usesBrokerServices: form.usesBrokerServices,
      },
      { headers: authHeaders },
    )
      .then((res) => {
        if (isApiSuccess(res)) {
          setCompany(res.data)
          setEditOpen(false)
        } else {
          setSaveError('Помилка збереження')
        }
      })
      .catch((err: ApiError) => {
        if (err.status === 401) onUnauthorized()
        else setSaveError(err.message ?? 'Помилка збереження')
      })
      .finally(() => setSaving(false))
  }

  if (isLoading) return <div className="pageState">Завантаження...</div>
  if (error) return <div className="pageState pageState--error">{error}</div>
  if (!company) return null

  return (
    <div className="company">
      <div className="company__header">
        <h2 className="company__title">Компанія</h2>
        {isAdmin && (
          <Button variant="primary" onClick={openEdit}>
            Редагувати
          </Button>
        )}
      </div>

      <Card>
        <table className="company__table">
          <tbody>
            <tr>
              <th>Назва</th>
              <td>{company.name}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>{company.email ?? '—'}</td>
            </tr>
            <tr>
              <th>Телефон</th>
              <td>{company.phone ?? '—'}</td>
            </tr>
            <tr>
              <th>Адреса</th>
              <td>{company.address ?? '—'}</td>
            </tr>
            <tr>
              <th>Режим роботи</th>
              <td>{OPERATION_MODE_LABELS[company.operationMode]}</td>
            </tr>
            <tr>
              <th>Власний флот</th>
              <td>{company.hasOwnFleet ? 'Так' : 'Ні'}</td>
            </tr>
            <tr>
              <th>Брокерські послуги</th>
              <td>{company.usesBrokerServices ? 'Так' : 'Ні'}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* ── Bank accounts section ── */}
      <div className="company__header" style={{ marginTop: 24 }}>
        <h2 className="company__title">Банківські рахунки</h2>
        {isAdmin && (
          <Button variant="primary" onClick={() => openAccDrawer()}>
            + Додати рахунок
          </Button>
        )}
      </div>

      {accError && <div className="company__saveError">{accError}</div>}

      <Card>
        {accLoading ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>Завантаження…</div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>
            Рахунки не додані. Додайте хоча б один активний рахунок — він буде вказаний у рахунках на оплату.
          </div>
        ) : (
          <table className="company__table">
            <thead>
              <tr>
                <th>Назва</th>
                <th>Рахунок (IBAN)</th>
                <th>Статус</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td style={{ fontWeight: 600 }}>{acc.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{acc.account}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      background: acc.is_active ? 'rgba(22,163,74,0.1)' : 'rgba(100,100,100,0.1)',
                      color: acc.is_active ? '#15803d' : 'var(--muted)',
                    }}>
                      {acc.is_active ? 'Активний' : 'Неактивний'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="ghost" onClick={() => openAccDrawer(acc)}>Редагувати</Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleActive(acc)}>
                        {acc.is_active ? 'Деактивувати' : 'Активувати'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void deleteAccount(acc.id)}>Видалити</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── Account drawer ── */}
      <Drawer
        open={accDrawerOpen}
        title={accEditTarget ? 'Редагувати рахунок' : 'Додати рахунок'}
        onClose={() => setAccDrawerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccDrawerOpen(false)} disabled={accSaving}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={() => void saveAccount()} disabled={accSaving}>
              {accSaving ? 'Збереження…' : 'Зберегти'}
            </Button>
          </>
        }
      >
        <div className="company__form">
          <label className="company__label">
            Назва отримувача *
            <input
              className="company__input"
              placeholder="ТОВ «Назва компанії»"
              value={accForm.name}
              onChange={(e) => setAccForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Рахунок (IBAN) *
            <input
              className="company__input"
              placeholder="UA12 3456 7890 0000 0001 2345 6789 0"
              value={accForm.account}
              onChange={(e) => setAccForm((f) => ({ ...f, account: e.target.value }))}
            />
          </label>
          {accSaveError && <div className="company__saveError">{accSaveError}</div>}
        </div>
      </Drawer>

      <Drawer
        open={editOpen}
        title="Редагувати компанію"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти'}
            </Button>
          </>
        }
      >
        <div className="company__form">
          <label className="company__label">
            Назва *
            <input
              className="company__input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Email
            <input
              className="company__input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Телефон
            <input
              className="company__input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Адреса
            <input
              className="company__input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="company__label">
            Режим роботи
            <select
              className="company__input"
              value={form.operationMode}
              onChange={(e) =>
                setForm((f) => ({ ...f, operationMode: e.target.value as OperationMode }))
              }
            >
              {(Object.entries(OPERATION_MODE_LABELS) as [OperationMode, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                )
              )}
            </select>
          </label>
          <label className="company__checkLabel">
            <input
              type="checkbox"
              checked={form.hasOwnFleet}
              onChange={(e) => setForm((f) => ({ ...f, hasOwnFleet: e.target.checked }))}
            />
            Власний флот
          </label>
          <label className="company__checkLabel">
            <input
              type="checkbox"
              checked={form.usesBrokerServices}
              onChange={(e) =>
                setForm((f) => ({ ...f, usesBrokerServices: e.target.checked }))
              }
            />
            Брокерські послуги
          </label>
          {saveError && <div className="company__saveError">{saveError}</div>}
        </div>
      </Drawer>
    </div>
  )
}
