# Driver Salary Auto-Calculation in Contract Form

**Date:** 2026-04-25  
**Scope:** `CreateOrderPage` form — auto-fill `estimatedSalaryCost` when a driver is selected

---

## Problem

When a vehicle is selected in the contract form, `estimatedFuelCost` is auto-calculated from the vehicle's `fuelConsumption`, route distance, and current fuel price. The `estimatedSalaryCost` field has no equivalent — it is always a manual input. The `drivers` model already has `pay_rate` and `pay_type` columns, but they are not surfaced in the form.

---

## Solution

Mirror the existing fuel-cost auto-calc pattern for driver salary: extend the lookups response to include driver pay info, store route duration from Mapbox, and add a `useEffect` that writes `estimatedSalaryCost` and a hint string whenever the driver or route changes.

---

## Backend

**File:** `server/src/router/orders.router.ts` — `GET /api/orders/lookups`

Add `pay_rate` and `pay_type` to the Prisma driver select:

```ts
select: { id: true, first_name: true, last_name: true, pay_rate: true, pay_type: true }
```

Include them in the response map:

```ts
{ id, name, payRate: d.pay_rate ?? null, payType: d.pay_type, isBusy, busyOrderNumber, busyStatus }
```

No schema migration needed — fields already exist.

---

## Frontend

**File:** `client/src/features/orders/CreateOrderPage.tsx`

### 1. Type update

```ts
type LookupDriver = {
  id: string; name: string; isBusy: boolean;
  busyOrderNumber: string | null; busyStatus: string | null;
  payRate?: number; payType?: string;
}
```

### 2. Route duration state

Add `durationHours` state alongside `distanceKm`:

```ts
const [durationHours, setDurationHours] = useState<number | null>(null)
```

In `calcDist`, extract duration from the Mapbox response:

```ts
setDistanceKm(Math.round(route.distance / 1000))
setDurationHours(route.duration / 3600)
```

Reset both to `null` when one coordinate is missing.

### 3. Salary auto-calc useEffect

Triggers on: `form.driverId`, `distanceKm`, `durationHours`, `form.pickupDate`, `form.deliveryDate`.

```ts
useEffect(() => {
  if (form.executionType !== 'INTERNAL') return
  const driver = lookups?.drivers.find(d => d.id === form.driverId)
  if (!driver?.payRate) { setSalaryCalcNote(null); return }

  let calc: number | null = null
  let note: string | null = null
  const { payRate, payType } = driver

  if (payType === 'PER_KM' && distanceKm) {
    calc = Math.round(distanceKm * payRate)
    note = `${distanceKm} км × ${payRate} ₴/км = ${calc} ₴`
  } else if (payType === 'PER_HOUR' && durationHours) {
    calc = Math.round(durationHours * payRate)
    note = `${durationHours.toFixed(1)} год × ${payRate} ₴/год = ${calc} ₴`
  } else if (payType === 'PER_DAY' && form.pickupDate && form.deliveryDate) {
    const days = Math.ceil(
      (Date.parse(form.deliveryDate) - Date.parse(form.pickupDate)) / 86_400_000
    )
    if (days > 0) {
      calc = Math.round(days * payRate)
      note = `${days} дн × ${payRate} ₴/день = ${calc} ₴`
    }
  } else if (payType === 'FIXED') {
    calc = Math.round(payRate)
    note = `Фіксована ставка: ${calc} ₴`
  }

  if (calc !== null) {
    setForm(s => ({ ...s, estimatedSalaryCost: String(calc) }))
    setSalaryCalcNote(note)
  } else {
    setSalaryCalcNote(null)
  }
}, [form.driverId, form.executionType, form.pickupDate, form.deliveryDate, distanceKm, durationHours])
```

### 4. Salary hint UI

Under the `estimatedSalaryCost` input — same markup as the fuel hint:

```tsx
<label>
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
```

---

## Behaviour summary

| Condition | Result |
|-----------|--------|
| Driver has no `pay_rate` | Field stays empty, no hint |
| PER_KM, route known | Auto-fills, shows hint |
| PER_HOUR, route known | Auto-fills using Mapbox duration |
| PER_DAY, both dates set | Auto-fills using date diff |
| PER_DAY, dates missing | No auto-fill |
| FIXED | Auto-fills with flat rate |
| User edits field manually | Hint cleared, value kept |
| Driver deselected | Field cleared, hint removed |

---

## Files changed

| File | Change |
|------|--------|
| `server/src/router/orders.router.ts` | Add `pay_rate`, `pay_type` to driver select + response |
| `client/src/features/orders/CreateOrderPage.tsx` | `LookupDriver` type, `durationHours` state, salary `useEffect`, hint UI |
