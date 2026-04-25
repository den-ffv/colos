import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft01Icon, Tick01Icon } from 'hugeicons-react'
import type { AuthTokens } from '../auth/auth.storage'
import { apiGetJson, apiPostJson, apiPutJson, type ApiError } from '../../lib/api'
import type { ApiResponse } from '../../lib/apiResponse'
import { Button } from '../../ui/Button'
import { CustomSelect } from '../../ui/CustomSelect'
import { AddressAutocomplete, type AddressSelection } from './AddressAutocomplete'
import { RouteMap } from './RouteMap'
import './create-order.css'

/* ─── types ──────────────────────────────────────────────── */

type ExecutionType = 'INTERNAL' | 'EXTERNAL'

type LookupClient  = { id: string; companyName: string; contactPerson: string; phone: string; email?: string; address?: string }
type LookupDriver  = { id: string; name: string; isBusy: boolean; busyOrderNumber: string | null; busyStatus: string | null; payRate?: number | null; payType?: 'PER_KM' | 'PER_HOUR' | 'PER_DAY' | 'FIXED' }
type LookupVehicle = { id: string; plateNumber: string; type: string; capacity: number; fuelConsumption?: number; fuelType?: string; isBusy: boolean; busyOrderNumber: string | null; busyStatus: string | null }
type LookupCarrier = { id: string; companyName: string }
type Lookups = { clients: LookupClient[]; drivers: LookupDriver[]; vehicles: LookupVehicle[]; carriers: LookupCarrier[] }

export type OrderDetail = {
  id: string; orderNumber: string; clientId: string
  executionType: ExecutionType; pickupAddress: string; deliveryAddress: string
  pickupDate: string; deliveryDate?: string; productType?: string
  quantity?: number; unit?: string; weight?: number; volume?: number
  driverId?: string; vehicleId?: string
  estimatedFuelCost?: number; estimatedSalaryCost?: number
  carrierId?: string; carrierAgreedPrice?: number; carrierVehicleInfo?: string
  clientPrice: number; notes?: string
}

type Coords = [number, number]

/* ─── helpers ────────────────────────────────────────────── */

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? ''

function isSuccess<T>(r: ApiResponse<T>): r is { success: true; data: T } {
  return !!r && 'success' in r && (r as { success: unknown }).success === true
}

function todayIso() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function emptyToNull(v: string) {
  const s = v.trim(); return s || null
}

function toNum(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const DRAFT_KEY = 'colos:order-draft'

function saveDraft(f: Record<string, string>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}
function loadDraft(): Record<string, string> | null {
  try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) as Record<string, string> : null }
  catch { return null }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

/* ─── empty form ─────────────────────────────────────────── */

const EMPTY: Record<string, string> = {
  clientId: '', executionType: 'INTERNAL',
  pickupAddress: '', deliveryAddress: '',
  pickupDate: todayIso(), deliveryDate: '',
  productType: '', quantity: '', unit: '', weight: '', volume: '',
  driverId: '', vehicleId: '', estimatedFuelCost: '', estimatedSalaryCost: '',
  carrierId: '', carrierAgreedPrice: '', carrierVehicleInfo: '',
  clientPrice: '', notes: '',
  // new-client inline fields
  newCompanyName: '', newContactPerson: '', newPhone: '', newEmail: '', newAddress: '',
}

/* ─── validation ─────────────────────────────────────────── */

function validate(f: Record<string, string>, clientMode: 'existing' | 'new'): Record<string, string> {
  const e: Record<string, string> = {}
  if (clientMode === 'existing') {
    if (!f.clientId) e.clientId = 'Оберіть клієнта'
  } else {
    if (!f.newCompanyName?.trim())    e.newCompanyName    = "Обов'язкове поле"
    if (!f.newContactPerson?.trim())  e.newContactPerson  = "Обов'язкове поле"
    if (!f.newPhone?.trim())          e.newPhone          = "Обов'язкове поле"
  }
  if (!f.pickupAddress?.trim())            e.pickupAddress = "Обов'язкове поле"
  else if (f.pickupAddress.trim().length < 5) e.pickupAddress = 'Мінімум 5 символів'
  if (!f.deliveryAddress?.trim())          e.deliveryAddress = "Обов'язкове поле"
  else if (f.deliveryAddress.trim().length < 5) e.deliveryAddress = 'Мінімум 5 символів'
  if (!f.pickupDate)                       e.pickupDate = 'Вкажіть дату забору'
  if (f.deliveryDate && f.pickupDate && Date.parse(f.deliveryDate) < Date.parse(f.pickupDate))
    e.deliveryDate = 'Не може бути раніше дати забору'
  if (!f.clientPrice?.trim())             e.clientPrice = "Обов'язкове поле"
  else if (Number(f.clientPrice) < 0)     e.clientPrice = 'Повинна бути ≥ 0'
  return e
}

/* ─── component ─────────────────────────────────────────── */

type Props = {
  tokens: AuthTokens
  onUnauthorized: () => void
  /** Якщо передано — це редагування існуючого договору */
  editOrder?: OrderDetail
  /** Викликається після успішного збереження */
  onSaved: (id: string) => void
  /** Повернутись без збереження */
  onCancel: () => void
}

export function CreateOrderPage({ tokens, onUnauthorized, editOrder, onSaved, onCancel }: Props) {
  const isEdit = !!editOrder
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${tokens.accessToken}` }), [tokens])

  /* ── form state ─────────────────────────────────────── */
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (isEdit) {
      const d = editOrder
      return {
        ...EMPTY,
        clientId:             d.clientId,
        executionType:        d.executionType,
        pickupAddress:        d.pickupAddress,
        deliveryAddress:      d.deliveryAddress,
        pickupDate:           d.pickupDate ? d.pickupDate.slice(0, 16) : '',
        deliveryDate:         d.deliveryDate ? d.deliveryDate.slice(0, 16) : '',
        productType:          d.productType ?? '',
        quantity:             d.quantity?.toString() ?? '',
        unit:                 d.unit ?? '',
        weight:               d.weight?.toString() ?? '',
        volume:               d.volume?.toString() ?? '',
        driverId:             d.driverId ?? '',
        vehicleId:            d.vehicleId ?? '',
        estimatedFuelCost:    d.estimatedFuelCost?.toString() ?? '',
        estimatedSalaryCost:  d.estimatedSalaryCost?.toString() ?? '',
        carrierId:            d.carrierId ?? '',
        carrierAgreedPrice:   d.carrierAgreedPrice?.toString() ?? '',
        carrierVehicleInfo:   d.carrierVehicleInfo ?? '',
        clientPrice:          d.clientPrice.toString(),
        notes:                d.notes ?? '',
      }
    }
    return loadDraft() ?? { ...EMPTY }
  })

  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [touched, setTouched]   = useState<Record<string, boolean>>({})
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)

  /* ── client section state ───────────────────────────── */
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing')
  const [selectedClient, setSelectedClient] = useState<LookupClient | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [clientListOpen, setClientListOpen] = useState(false)

  /* ── coords / distance ─────────────────────────────── */
  const [pickupCoords,   setPickupCoords]   = useState<Coords | null>(null)
  const [deliveryCoords, setDeliveryCoords] = useState<Coords | null>(null)
  const [distanceKm,     setDistanceKm]     = useState<number | null>(null)
  const [durationHours,  setDurationHours]  = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const calcDist = useCallback(async (from: Coords, to: Coords) => {
    if (!MAPBOX_TOKEN) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=false&access_token=${MAPBOX_TOKEN}`
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) return
      const data = await res.json()
      const route = data?.routes?.[0]
      if (route) {
        setDistanceKm(Math.round(route.distance / 1000))
        setDurationHours(route.duration / 3600)
      }
    } catch { /* aborted */ }
  }, [])

  const onPickup = useCallback((sel: AddressSelection) => {
    setPickupCoords(sel.coords)
    if (sel.coords && deliveryCoords) void calcDist(sel.coords, deliveryCoords)
    else { setDistanceKm(null); setDurationHours(null) }
  }, [deliveryCoords, calcDist])

  const onDelivery = useCallback((sel: AddressSelection) => {
    setDeliveryCoords(sel.coords)
    if (pickupCoords && sel.coords) void calcDist(pickupCoords, sel.coords)
    else { setDistanceKm(null); setDurationHours(null) }
  }, [pickupCoords, calcDist])

  /* ── fuel prices ────────────────────────────────────── */
  type FuelPriceEntry = { fuel_type: string; price: number }
  const [fuelPrices, setFuelPrices] = useState<FuelPriceEntry[]>([])
  const [fuelCalcNote,   setFuelCalcNote]   = useState<string | null>(null)
  const [salaryCalcNote, setSalaryCalcNote] = useState<string | null>(null)

  /* ── lookups ────────────────────────────────────────── */
  const [lookups, setLookups] = useState<Lookups | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiGetJson<ApiResponse<Lookups>>('/api/orders/lookups', { headers: authHeaders })
        if (isSuccess(res)) setLookups(res.data)
      } catch (err) {
        const e = err as Partial<ApiError>
        if (e.status === 401) onUnauthorized()
      }
    }
    void load()
  }, [authHeaders, onUnauthorized])

  useEffect(() => {
    type FuelRes = { fuel_type: string; price: number }[]
    apiGetJson<ApiResponse<FuelRes>>('/api/market-data/fuel-prices', { headers: authHeaders })
      .then((res) => { if (isSuccess(res)) setFuelPrices(res.data) })
      .catch(() => { /* no fuel prices available */ })
  }, [authHeaders])

  /* ── auto-calc fuel cost ────────────────────────────── */
  useEffect(() => {
    if (form.executionType !== 'INTERNAL') return
    const vehicle = (lookups?.vehicles ?? []).find((v) => v.id === form.vehicleId)
    if (!vehicle?.fuelConsumption || !distanceKm || fuelPrices.length === 0) {
      setFuelCalcNote(null)
      return
    }
    const fuelType = vehicle.fuelType ?? 'DIESEL'
    const priceEntry = fuelPrices.find((p) => p.fuel_type === fuelType)
      ?? fuelPrices.find((p) => p.fuel_type === 'DIESEL')
    if (!priceEntry) { setFuelCalcNote(null); return }

    const calc = Math.round((distanceKm / 100) * vehicle.fuelConsumption * priceEntry.price)
    setForm((s) => ({ ...s, estimatedFuelCost: String(calc) }))
    setFuelCalcNote(
      `Авто: ${(distanceKm / 100 * vehicle.fuelConsumption).toFixed(1)} л × ${priceEntry.price} ₴/л = ${calc} ₴`
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vehicleId, form.executionType, distanceKm, fuelPrices])

  /* ── auto-calc salary cost ──────────────────────────── */
  useEffect(() => {
    if (isEdit) return
    if (form.executionType !== 'INTERNAL') { setSalaryCalcNote(null); return }
    if (!form.driverId) {
      setForm((s) => ({ ...s, estimatedSalaryCost: '' }))
      setSalaryCalcNote(null)
      return
    }
    const driver = (lookups?.drivers ?? []).find((d) => d.id === form.driverId)
    if (!driver?.payRate) { setSalaryCalcNote(null); return }

    const { payRate, payType } = driver
    let calc: number | null = null
    let note: string | null = null

    if (payType === 'PER_KM' && distanceKm) {
      calc = Math.round(distanceKm * payRate)
      note = `${distanceKm} км × ${payRate} ₴/км = ${calc} ₴`
    } else if (payType === 'PER_HOUR' && durationHours) {
      calc = Math.round(durationHours * payRate)
      note = `${durationHours.toFixed(1)} год × ${payRate} ₴/год = ${calc} ₴`
    } else if (payType === 'PER_DAY' && form.pickupDate && form.deliveryDate) {
      const days = Math.ceil(
        (Date.parse(form.deliveryDate) - Date.parse(form.pickupDate)) / 86_400_000,
      )
      if (days > 0) {
        calc = Math.round(days * payRate)
        note = `${days} дн × ${payRate} ₴/день = ${calc} ₴`
      }
    } else if (payType === 'FIXED') {
      calc = payRate
      note = `Фіксована ставка: ${calc} ₴`
    }

    if (calc !== null) {
      setForm((s) => ({ ...s, estimatedSalaryCost: String(calc) }))
      setSalaryCalcNote(note)
    } else {
      setSalaryCalcNote(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.driverId, form.executionType, form.pickupDate, form.deliveryDate, distanceKm, durationHours])

  /* ── auto-save draft ────────────────────────────────── */
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isEdit) return // не зберігаємо чернетку при редагуванні
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => saveDraft(form), 1500)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [form, isEdit])

  /* ── live margin ────────────────────────────────────── */
  const liveMargin = useMemo(() => {
    const price = Number(form.clientPrice) || 0
    const cost = form.executionType === 'INTERNAL'
      ? (Number(form.estimatedFuelCost) || 0) + (Number(form.estimatedSalaryCost) || 0)
      : (Number(form.carrierAgreedPrice) || 0)
    const margin = price - cost
    const pct = price > 0 ? (margin / price) * 100 : 0
    return { margin, pct, cost, price }
  }, [form.clientPrice, form.executionType, form.estimatedFuelCost, form.estimatedSalaryCost, form.carrierAgreedPrice])

  /* ── field helpers ──────────────────────────────────── */
  function set(key: string, val: string) {
    setForm((s) => ({ ...s, [key]: val }))
    setTouched((s) => ({ ...s, [key]: true }))
    if (errors[key]) setErrors((s) => { const c = { ...s }; delete c[key]; return c })
  }

  function blur(key: string) {
    setTouched((s) => ({ ...s, [key]: true }))
    const errs = validate({ ...form }, clientMode)
    if (errs[key]) setErrors((s) => ({ ...s, [key]: errs[key] }))
    else setErrors((s) => { const c = { ...s }; delete c[key]; return c })
  }

  function fieldErr(key: string) {
    return touched[key] ? errors[key] : undefined
  }

  /* ── submit ─────────────────────────────────────────── */
  async function submit() {
    const allTouched: Record<string, boolean> = {}
    Object.keys(form).forEach((k) => { allTouched[k] = true })
    setTouched(allTouched)
    const errs = validate(form, clientMode)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const firstKey = Object.keys(errs)[0]
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitErr(null)
    setSaving(true)
    try {
      // If creating a new client inline — POST it first
      let resolvedClientId = form.clientId
      if (clientMode === 'new') {
        type ClientResp = { id: string; companyName: string; contactPerson: string; phone: string; email?: string; address?: string }
        const clientRes = await apiPostJson<ApiResponse<ClientResp>>('/api/clients', {
          companyName:   form.newCompanyName.trim(),
          contactPerson: form.newContactPerson.trim(),
          phone:         form.newPhone.trim(),
          email:         emptyToNull(form.newEmail),
          address:       emptyToNull(form.newAddress),
        }, { headers: authHeaders })
        if (!isSuccess(clientRes)) throw new Error((clientRes as { message: string }).message)
        resolvedClientId = clientRes.data.id
        // Оновлюємо lookups щоб новий клієнт з'явився у списку
        setLookups((prev) => prev ? {
          ...prev,
          clients: [...prev.clients, {
            id: clientRes.data.id,
            companyName: clientRes.data.companyName,
            contactPerson: clientRes.data.contactPerson,
            phone: clientRes.data.phone,
            email: clientRes.data.email,
            address: clientRes.data.address,
          }],
        } : prev)
      }

      const payload: Record<string, unknown> = {
        clientId:        resolvedClientId || null,
        executionType:   form.executionType,
        pickupAddress:   form.pickupAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        pickupDate:      form.pickupDate || null,
        deliveryDate:    emptyToNull(form.deliveryDate),
        productType:     emptyToNull(form.productType),
        quantity:        toNum(form.quantity),
        unit:            emptyToNull(form.unit),
        weight:          toNum(form.weight),
        volume:          toNum(form.volume),
        clientPrice:     toNum(form.clientPrice) ?? 0,
        notes:           emptyToNull(form.notes),
      }
      if (form.executionType === 'INTERNAL') {
        payload.driverId             = emptyToNull(form.driverId)
        payload.vehicleId            = emptyToNull(form.vehicleId)
        payload.estimatedFuelCost    = toNum(form.estimatedFuelCost)
        payload.estimatedSalaryCost  = toNum(form.estimatedSalaryCost)
        payload.carrierId = null; payload.carrierAgreedPrice = null; payload.carrierVehicleInfo = null
      } else {
        payload.carrierId            = emptyToNull(form.carrierId)
        payload.carrierAgreedPrice   = toNum(form.carrierAgreedPrice)
        payload.carrierVehicleInfo   = emptyToNull(form.carrierVehicleInfo)
        payload.driverId = null; payload.vehicleId = null
        payload.estimatedFuelCost = null; payload.estimatedSalaryCost = null
      }

      if (isEdit) {
        const res = await apiPutJson<ApiResponse<OrderDetail>>(`/api/orders/${editOrder.id}`, payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        clearDraft()
        onSaved(editOrder.id)
      } else {
        const res = await apiPostJson<ApiResponse<OrderDetail>>('/api/orders', payload, { headers: authHeaders })
        if (!isSuccess(res)) throw new Error((res as { message: string }).message)
        clearDraft()
        onSaved(res.data.id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження'
      setSubmitErr(msg)
    } finally {
      setSaving(false)
    }
  }

  /* ── keyboard shortcut Ctrl+Enter ──────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !saving) void submit()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving])

  const isInternal = form.executionType === 'INTERNAL'
  const showMap = !!form.pickupAddress.trim() && !!form.deliveryAddress.trim()

  /* ── render ─────────────────────────────────────────── */
  return (
    <div className="co">

      {/* ── top bar ──────────────────────────────────── */}
      <div className="co__topbar">
        <button type="button" className="co__back" onClick={onCancel}>
          <ArrowLeft01Icon size={16} strokeWidth={2} />
          <span>До списку</span>
        </button>
        <h2 className="co__title">{isEdit ? `Редагування ${editOrder.orderNumber}` : 'Новий договір'}</h2>
        <div className="co__topActions">
          {!isEdit && loadDraft() && (
            <button type="button" className="co__draftClear" onClick={() => { clearDraft(); setForm({ ...EMPTY }) }}>
              Очистити чернетку
            </button>
          )}
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            <Tick01Icon size={15} strokeWidth={2.5} />
            {saving ? 'Збереження…' : (isEdit ? 'Зберегти зміни' : 'Створити')}
          </Button>
        </div>
      </div>

      <div className="co__body">

        {/* ══ LEFT: form ══════════════════════════════ */}
        <div className="co__form">

          {submitErr && <div className="co__submitErr">{submitErr}</div>}

          {/* ── Section 1: Route ─────────────────── */}
          <section className="co__section">
            <div className="co__sectionHead">
              <span className="co__sectionNum">1</span>
              <span className="co__sectionTitle">Клієнт та маршрут</span>
            </div>

            {/* ── Client mode toggle ──────────────── */}
            <div className="co__execToggle">
              <button type="button"
                className={`co__execBtn${clientMode === 'existing' ? ' co__execBtn--active' : ''}`}
                onClick={() => setClientMode('existing')}>
                Обрати існуючого
              </button>
              <button type="button"
                className={`co__execBtn${clientMode === 'new' ? ' co__execBtn--active' : ''}`}
                onClick={() => setClientMode('new')}>
                + Новий клієнт
              </button>
            </div>

            {clientMode === 'existing' ? (
              <div className="co__clientSearch" id="field-clientId">
                {/* Search input */}
                <div className="co__clientSearchWrap">
                  <input
                    className={`co__input${fieldErr('clientId') ? ' co__input--err' : ''}`}
                    placeholder="Пошук за назвою або контактом…"
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setClientListOpen(true) }}
                    onFocus={() => setClientListOpen(true)}
                    onBlur={() => setTimeout(() => setClientListOpen(false), 150)}
                  />
                  {clientListOpen && (
                    <div className="co__clientDropdown">
                      {(lookups?.clients ?? [])
                        .filter((c) => {
                          const q = clientSearch.toLowerCase()
                          return !q || c.companyName.toLowerCase().includes(q) || c.contactPerson.toLowerCase().includes(q)
                        })
                        .map((c) => (
                          <button key={c.id} type="button" className="co__clientOption"
                            onMouseDown={() => {
                              set('clientId', c.id)
                              setSelectedClient(c)
                              setClientSearch(c.companyName)
                              setClientListOpen(false)
                              // Auto-fill pickup address from client address if empty
                              if (c.address && !form.pickupAddress.trim()) {
                                set('pickupAddress', c.address)
                              }
                            }}>
                            <span className="co__clientOptionName">{c.companyName}</span>
                            <span className="co__clientOptionSub">{c.contactPerson} · {c.phone}</span>
                          </button>
                        ))
                      }
                      {(lookups?.clients ?? []).filter((c) => {
                        const q = clientSearch.toLowerCase()
                        return !q || c.companyName.toLowerCase().includes(q) || c.contactPerson.toLowerCase().includes(q)
                      }).length === 0 && (
                        <div className="co__clientOptionEmpty">Нічого не знайдено</div>
                      )}
                    </div>
                  )}
                </div>
                {fieldErr('clientId') && <span className="co__err">{fieldErr('clientId')}</span>}

                {/* Selected client card */}
                {selectedClient && (
                  <div className="co__clientCard">
                    <div className="co__clientCardHead">
                      <div className="co__clientCardName">{selectedClient.companyName}</div>
                      <button type="button" className="co__clientCardClear"
                        onClick={() => { set('clientId', ''); setSelectedClient(null); setClientSearch('') }}>
                        ✕
                      </button>
                    </div>
                    <div className="co__clientKv">
                      <span className="co__clientK">Контакт</span>
                      <span className="co__clientV">{selectedClient.contactPerson}</span>
                    </div>
                    <div className="co__clientKv">
                      <span className="co__clientK">Телефон</span>
                      <span className="co__clientV">{selectedClient.phone}</span>
                    </div>
                    {selectedClient.email && (
                      <div className="co__clientKv">
                        <span className="co__clientK">Email</span>
                        <span className="co__clientV">{selectedClient.email}</span>
                      </div>
                    )}
                    {selectedClient.address && (
                      <div className="co__clientKv">
                        <span className="co__clientK">Адреса</span>
                        <span className="co__clientV">
                          {selectedClient.address}
                          {!form.pickupAddress.trim() && (
                            <button type="button" className="co__clientUseAddr"
                              onClick={() => set('pickupAddress', selectedClient.address!)}>
                              Використати як адресу забору
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ── New client inline form ─────────── */
              <div className="co__execFields">
                <div className="co__row2">
                  <div className="co__field" id="field-newCompanyName">
                    <label className="co__label">Назва компанії <span className="co__req">*</span></label>
                    <input className={`co__input${fieldErr('newCompanyName') ? ' co__input--err' : ''}`}
                      value={form.newCompanyName}
                      onChange={(e) => set('newCompanyName', e.target.value)}
                      onBlur={() => blur('newCompanyName')}
                      placeholder="ТОВ «Назва»" />
                    {fieldErr('newCompanyName') && <span className="co__err">{fieldErr('newCompanyName')}</span>}
                  </div>
                  <div className="co__field" id="field-newContactPerson">
                    <label className="co__label">Контактна особа <span className="co__req">*</span></label>
                    <input className={`co__input${fieldErr('newContactPerson') ? ' co__input--err' : ''}`}
                      value={form.newContactPerson}
                      onChange={(e) => set('newContactPerson', e.target.value)}
                      onBlur={() => blur('newContactPerson')}
                      placeholder="Іваненко Іван" />
                    {fieldErr('newContactPerson') && <span className="co__err">{fieldErr('newContactPerson')}</span>}
                  </div>
                </div>
                <div className="co__row2">
                  <div className="co__field" id="field-newPhone">
                    <label className="co__label">Телефон <span className="co__req">*</span></label>
                    <input className={`co__input${fieldErr('newPhone') ? ' co__input--err' : ''}`}
                      value={form.newPhone}
                      onChange={(e) => set('newPhone', e.target.value)}
                      onBlur={() => blur('newPhone')}
                      placeholder="+380671234567" />
                    {fieldErr('newPhone') && <span className="co__err">{fieldErr('newPhone')}</span>}
                  </div>
                  <div className="co__field">
                    <label className="co__label">Email</label>
                    <input className="co__input" value={form.newEmail}
                      onChange={(e) => set('newEmail', e.target.value)}
                      placeholder="client@example.com" />
                  </div>
                </div>
                <div className="co__field">
                  <label className="co__label">Адреса клієнта</label>
                  <input className="co__input" value={form.newAddress}
                    onChange={(e) => {
                      set('newAddress', e.target.value)
                      // Auto-fill pickup address if empty
                      if (!form.pickupAddress.trim()) set('pickupAddress', e.target.value)
                    }}
                    placeholder="вул. Хрещатик, 1, Київ" />
                  <span className="co__hint">Буде запропоновано як адресу забору</span>
                </div>
              </div>
            )}

            <div className="co__row2">
              <div className="co__field" id="field-pickupAddress">
                <label className="co__label">
                  <span className="co__dot co__dot--green" /> Адреса забору <span className="co__req">*</span>
                </label>
                <AddressAutocomplete
                  value={form.pickupAddress}
                  onChange={(v) => set('pickupAddress', v)}
                  onSelect={onPickup}
                  placeholder="Введіть місто або адресу…"
                  className={`co__input${fieldErr('pickupAddress') ? ' co__input--err' : ''}`}
                />
                {fieldErr('pickupAddress') && <span className="co__err">{fieldErr('pickupAddress')}</span>}
              </div>

              <div className="co__field" id="field-deliveryAddress">
                <label className="co__label">
                  <span className="co__dot co__dot--red" /> Адреса доставки <span className="co__req">*</span>
                </label>
                <AddressAutocomplete
                  value={form.deliveryAddress}
                  onChange={(v) => set('deliveryAddress', v)}
                  onSelect={onDelivery}
                  placeholder="Введіть місто або адресу…"
                  className={`co__input${fieldErr('deliveryAddress') ? ' co__input--err' : ''}`}
                />
                {fieldErr('deliveryAddress') && <span className="co__err">{fieldErr('deliveryAddress')}</span>}
              </div>
            </div>

            {distanceKm !== null && (
              <div className="co__distBadge">
                📍 Відстань маршрутом: <strong>{distanceKm} км</strong>
              </div>
            )}

            <div className="co__row2">
              <div className="co__field" id="field-pickupDate">
                <label className="co__label">Дата забору <span className="co__req">*</span></label>
                <input
                  type="datetime-local"
                  className={`co__input${fieldErr('pickupDate') ? ' co__input--err' : ''}`}
                  value={form.pickupDate}
                  onChange={(e) => set('pickupDate', e.target.value)}
                  onBlur={() => blur('pickupDate')}
                />
                {fieldErr('pickupDate') && <span className="co__err">{fieldErr('pickupDate')}</span>}
              </div>
              <div className="co__field" id="field-deliveryDate">
                <label className="co__label">Планова дата доставки</label>
                <input
                  type="datetime-local"
                  className={`co__input${fieldErr('deliveryDate') ? ' co__input--err' : ''}`}
                  value={form.deliveryDate}
                  onChange={(e) => set('deliveryDate', e.target.value)}
                  onBlur={() => blur('deliveryDate')}
                />
                {fieldErr('deliveryDate') && <span className="co__err">{fieldErr('deliveryDate')}</span>}
              </div>
            </div>
          </section>

          {/* ── Section 2: Cargo ─────────────────── */}
          <section className="co__section">
            <div className="co__sectionHead">
              <span className="co__sectionNum">2</span>
              <span className="co__sectionTitle">Вантаж</span>
            </div>

            <div className="co__field">
              <label className="co__label">Тип вантажу</label>
              <input className="co__input" value={form.productType} onChange={(e) => set('productType', e.target.value)} placeholder="напр. Продукти харчування" />
            </div>

            <div className="co__row3">
              <div className="co__field">
                <label className="co__label">Кількість</label>
                <input type="number" min="0" className="co__input" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="0" />
              </div>
              <div className="co__field">
                <label className="co__label">Одиниця</label>
                <div className="co__unitRow">
                  <input className="co__input" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="тонн" />
                  <div className="co__unitHints">
                    {['тонн', 'палет', 'м³', 'шт'].map((u) => (
                      <button key={u} type="button" className={`co__unitBtn${form.unit === u ? ' co__unitBtn--active' : ''}`} onClick={() => set('unit', u)}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="co__field">
                <label className="co__label">Маса (т)</label>
                <input type="number" min="0" step="0.1" className="co__input" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="0.0" />
              </div>
            </div>
          </section>

          {/* ── Section 3: Executor ─────────────── */}
          <section className="co__section">
            <div className="co__sectionHead">
              <span className="co__sectionNum">3</span>
              <span className="co__sectionTitle">Тип виконання</span>
            </div>

            <div className="co__execToggle">
              <button
                type="button"
                className={`co__execBtn${isInternal ? ' co__execBtn--active' : ''}`}
                onClick={() => set('executionType', 'INTERNAL')}
              >
                🚛 Власний автопарк
              </button>
              <button
                type="button"
                className={`co__execBtn${!isInternal ? ' co__execBtn--active' : ''}`}
                onClick={() => set('executionType', 'EXTERNAL')}
              >
                🤝 Зовнішній перевізник
              </button>
            </div>

            {isInternal ? (
              <div className="co__execFields">
                <div className="co__row2">
                  {/* ── Driver picker ── */}
                  <div className="co__field">
                    <label className="co__label">Водій</label>
                    <CustomSelect
                      value={form.driverId}
                      onChange={(v) => set('driverId', v)}
                      placeholder="— не призначено —"
                      warn={!!(form.driverId && (lookups?.drivers ?? []).find((d) => d.id === form.driverId)?.isBusy)}
                      options={[
                        { value: '', label: '— не призначено —' },
                        ...(lookups?.drivers ?? []).map((d) => ({
                          value: d.id,
                          label: d.name,
                          sublabel: d.isBusy
                            ? `${d.busyStatus === 'IN_TRANSIT' ? 'В дорозі' : 'Підтверджено'} · ${d.busyOrderNumber ?? ''}`
                            : undefined,
                          badge: d.isBusy ? 'Зайнятий' : undefined,
                          warn: d.isBusy,
                        })),
                      ]}
                    />
                    {form.driverId && (lookups?.drivers ?? []).find((d) => d.id === form.driverId)?.isBusy && (
                      <span className="co__resWarn">⚠ Водій вже виконує інший договір</span>
                    )}
                  </div>

                  {/* ── Vehicle picker ── */}
                  <div className="co__field">
                    <label className="co__label">Автомобіль</label>
                    <CustomSelect
                      value={form.vehicleId}
                      onChange={(v) => set('vehicleId', v)}
                      placeholder="— не призначено —"
                      warn={!!(form.vehicleId && (lookups?.vehicles ?? []).find((v) => v.id === form.vehicleId)?.isBusy)}
                      options={[
                        { value: '', label: '— не призначено —' },
                        ...(lookups?.vehicles ?? []).map((v) => ({
                          value: v.id,
                          label: `${v.plateNumber} · ${v.type} · ${v.capacity}т`,
                          sublabel: v.isBusy
                            ? `${v.busyStatus === 'IN_TRANSIT' ? 'В дорозі' : 'Підтверджено'} · ${v.busyOrderNumber ?? ''}`
                            : undefined,
                          badge: v.isBusy ? 'Зайнято' : undefined,
                          warn: v.isBusy,
                        })),
                      ]}
                    />
                    {form.vehicleId && (lookups?.vehicles ?? []).find((v) => v.id === form.vehicleId)?.isBusy && (
                      <span className="co__resWarn">⚠ Авто вже використовується в іншому договорі</span>
                    )}
                  </div>
                </div>
                <div className="co__row2">
                  <div className="co__field">
                    <label className="co__label">
                      Витрати на пальне (₴)
                      {fuelCalcNote && <span className="co__calcBadge">авто</span>}
                    </label>
                    <input type="number" min="0" className="co__input" value={form.estimatedFuelCost}
                      onChange={(e) => { set('estimatedFuelCost', e.target.value); setFuelCalcNote(null) }}
                      placeholder="0" />
                    {fuelCalcNote && <span className="co__hint co__hint--calc">{fuelCalcNote}</span>}
                  </div>
                  <div className="co__field">
                    <label className="co__label">
                      Зарплата водія (₴)
                      {salaryCalcNote && <span className="co__calcBadge">авто</span>}
                    </label>
                    <input
                      type="number" min="0" className="co__input"
                      value={form.estimatedSalaryCost}
                      onChange={(e) => { set('estimatedSalaryCost', e.target.value); setSalaryCalcNote(null) }}
                      placeholder="0"
                    />
                    {salaryCalcNote && <span className="co__hint co__hint--calc">{salaryCalcNote}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="co__execFields">
                <div className="co__field">
                  <label className="co__label">Перевізник</label>
                  <CustomSelect
                    value={form.carrierId}
                    onChange={(v) => set('carrierId', v)}
                    placeholder="— оберіть перевізника —"
                    options={[
                      { value: '', label: '— оберіть перевізника —' },
                      ...(lookups?.carriers ?? []).map((c) => ({
                        value: c.id,
                        label: c.companyName,
                      })),
                    ]}
                  />
                </div>
                <div className="co__row2">
                  <div className="co__field">
                    <label className="co__label">Ціна перевізника (₴)</label>
                    <input type="number" min="0" className="co__input" value={form.carrierAgreedPrice} onChange={(e) => set('carrierAgreedPrice', e.target.value)} placeholder="0" />
                  </div>
                  <div className="co__field">
                    <label className="co__label">Авто перевізника</label>
                    <input className="co__input" value={form.carrierVehicleInfo} onChange={(e) => set('carrierVehicleInfo', e.target.value)} placeholder="напр. AA 1234 BC / MAN" />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── Section 4: Finances ─────────────── */}
          <section className="co__section">
            <div className="co__sectionHead">
              <span className="co__sectionNum">4</span>
              <span className="co__sectionTitle">Фінанси</span>
            </div>

            <div className="co__field" id="field-clientPrice">
              <label className="co__label">Ціна для клієнта (₴) <span className="co__req">*</span></label>
              <input
                type="number" min="0" step="0.01"
                className={`co__input co__input--price${fieldErr('clientPrice') ? ' co__input--err' : ''}`}
                value={form.clientPrice}
                onChange={(e) => set('clientPrice', e.target.value)}
                onBlur={() => blur('clientPrice')}
                placeholder="0.00"
              />
              {fieldErr('clientPrice') && <span className="co__err">{fieldErr('clientPrice')}</span>}
            </div>

            {/* Live margin preview */}
            {(liveMargin.price > 0 || liveMargin.cost > 0) && (
              <div className={`co__marginCard${liveMargin.margin < 0 ? ' co__marginCard--loss' : ' co__marginCard--profit'}`}>
                <div className="co__marginRow">
                  <span>Ціна клієнта</span>
                  <strong>{liveMargin.price.toLocaleString('uk-UA')} ₴</strong>
                </div>
                <div className="co__marginRow">
                  <span>Собівартість</span>
                  <span>{liveMargin.cost.toLocaleString('uk-UA')} ₴</span>
                </div>
                <div className="co__marginRow co__marginRow--total">
                  <span>Маржа</span>
                  <strong style={{ color: liveMargin.margin >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                    {liveMargin.margin.toLocaleString('uk-UA')} ₴ ({liveMargin.pct.toFixed(1)}%)
                  </strong>
                </div>
              </div>
            )}

            <div className="co__field">
              <label className="co__label">Нотатки</label>
              <textarea className="co__textarea" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Додаткова інформація…" />
            </div>
          </section>

          {/* ── Bottom actions ───────────────────── */}
          <div className="co__bottomActions">
            {submitErr && <div className="co__submitErr">{submitErr}</div>}
            <Button variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving}>
              <Tick01Icon size={15} strokeWidth={2.5} />
              {saving ? 'Збереження…' : (isEdit ? 'Зберегти зміни' : 'Створити договір')}
            </Button>
            <span className="co__hint">або Ctrl+Enter</span>
          </div>
        </div>

        {/* ══ RIGHT: map ══════════════════════════════ */}
        <div className="co__mapPanel">
          <div className="co__mapSticky">
            {showMap ? (
              <RouteMap
                pickupAddress={form.pickupAddress}
                deliveryAddress={form.deliveryAddress}
                pickupCoords={pickupCoords ?? undefined}
                deliveryCoords={deliveryCoords ?? undefined}
              />
            ) : (
              <div className="co__mapPlaceholder">
                <div className="co__mapPlaceholderIcon">🗺️</div>
                <div className="co__mapPlaceholderText">
                  Введіть адреси забору та доставки — карта оновиться автоматично
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
