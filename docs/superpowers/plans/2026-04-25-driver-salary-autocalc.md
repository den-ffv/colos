# Driver Salary Auto-Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a driver is selected in the contract form, automatically calculate `estimatedSalaryCost` based on the driver's `pay_rate` / `pay_type` and the route distance/duration.

**Architecture:** Extend `/api/orders/lookups` to return driver pay info → store Mapbox route duration in frontend state → mirror the existing fuel-cost `useEffect` pattern for salary calculation → render a hint string under the salary field.

**Tech Stack:** Express + Prisma (backend), React 19 + TypeScript (frontend), Mapbox Directions API (already wired)

**Spec:** `docs/superpowers/specs/2026-04-25-driver-salary-autocalc-design.md`

---

## File Map

| File | Change |
|------|--------|
| `server/src/router/orders.router.ts` | Add `pay_rate`, `pay_type` to driver `select` and response map |
| `server/src/tests/app.test.ts` | Add `driver.findMany` + `vehicle.findMany` to Prisma mock; add lookups test |
| `client/src/features/orders/CreateOrderPage.tsx` | Update `LookupDriver` type, add `durationHours` state, update `calcDist`, add salary `useEffect` + `salaryCalcNote` state + hint UI |

---

## Task 1: Backend — Extend driver lookups with pay info

**Files:**
- Modify: `server/src/router/orders.router.ts`

- [ ] **Step 1.1: Add `pay_rate` and `pay_type` to the driver Prisma select**

In `server/src/router/orders.router.ts`, find the `prisma.driver.findMany` call inside `GET /lookups`. Change the `select` from:

```ts
select: { id: true, first_name: true, last_name: true },
```

to:

```ts
select: { id: true, first_name: true, last_name: true, pay_rate: true, pay_type: true },
```

- [ ] **Step 1.2: Include the new fields in the response map**

In the same handler, find the `drivers: drivers.map(...)` section. Change it from:

```ts
drivers: drivers.map((d) => {
  const busy = busyDrivers.get(d.id);
  return {
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    isBusy: !!busy,
    busyOrderNumber: busy?.orderNumber ?? null,
    busyStatus: busy?.status ?? null,
  };
}),
```

to:

```ts
drivers: drivers.map((d) => {
  const busy = busyDrivers.get(d.id);
  return {
    id: d.id,
    name: `${d.first_name} ${d.last_name}`,
    payRate: d.pay_rate ?? null,
    payType: d.pay_type,
    isBusy: !!busy,
    busyOrderNumber: busy?.orderNumber ?? null,
    busyStatus: busy?.status ?? null,
  };
}),
```

- [ ] **Step 1.3: Commit**

```bash
git add server/src/router/orders.router.ts
git commit -m "feat: include pay_rate and pay_type in orders lookups driver response"
```

---

## Task 2: Backend test — Verify lookups returns pay info

**Files:**
- Modify: `server/src/tests/app.test.ts`

- [ ] **Step 2.1: Add `driver` and `vehicle` to the Prisma mock setup**

In `app.test.ts`, find the `vi.mock('../utils/prisma', ...)` block. Add `driver` and `vehicle` entries (they are missing from the existing mock):

```ts
vi.mock('../utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    company: {
      findFirst: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    vehicle: {
      count: vi.fn(),
      findMany: vi.fn(),  // ← ADD THIS LINE
    },
    driver: {             // ← ADD ENTIRE BLOCK
      findMany: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    carrier: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));
```

- [ ] **Step 2.2: Write the failing test**

Add a new `describe` block at the end of `app.test.ts`:

```ts
/* ═══════════════════════════════════════════════════════════
   N. Orders — GET /lookups
═══════════════════════════════════════════════════════════ */

describe('GET /api/orders/lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('повертає payRate та payType для водіїв', async () => {
    // Мокуємо автентифікацію
    (prisma.user.findUnique as MockedFn).mockResolvedValue({
      ...mockUser,
      UserRoles: [{ role: 'ADMIN' }],
      user_roles: [{ role: 'ADMIN' }],
    });

    const token = signAccessToken({ userId: mockUser.id, companyId: mockUser.company_id, roles: ['ADMIN'] });

    // Мокуємо відповіді lookups
    (prisma.client.findMany as MockedFn).mockResolvedValue([]);
    (prisma.driver.findMany as MockedFn).mockResolvedValue([
      {
        id: 'driver-001',
        first_name: 'Олег',
        last_name: 'Шевченко',
        pay_rate: 8.5,
        pay_type: 'PER_KM',
      },
    ]);
    (prisma.vehicle.findMany as MockedFn).mockResolvedValue([]);
    (prisma.carrier.findMany as MockedFn).mockResolvedValue([]);
    (prisma.order.findMany as MockedFn).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/orders/lookups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const driver = res.body.data.drivers[0];
    expect(driver.payRate).toBe(8.5);
    expect(driver.payType).toBe('PER_KM');
    expect(driver.name).toBe('Олег Шевченко');
  });
});
```

- [ ] **Step 2.3: Run test to verify it fails (before backend change is committed)**

```bash
cd server && npx vitest run src/tests/app.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: test for lookups should fail because `payRate` is not yet in the response (this step validates TDD — if you already committed Task 1, this test should PASS instead, which is also fine).

- [ ] **Step 2.4: Run all tests to confirm no regressions**

```bash
cd server && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add server/src/tests/app.test.ts
git commit -m "test: add lookups endpoint test verifying driver payRate/payType in response"
```

---

## Task 3: Frontend — Update type, add durationHours state, update calcDist

**Files:**
- Modify: `client/src/features/orders/CreateOrderPage.tsx`

- [ ] **Step 3.1: Update `LookupDriver` type**

Find the type definition near the top of `CreateOrderPage.tsx` (line ~17):

```ts
type LookupDriver  = { id: string; name: string; isBusy: boolean; busyOrderNumber: string | null; busyStatus: string | null }
```

Replace with:

```ts
type LookupDriver  = { id: string; name: string; isBusy: boolean; busyOrderNumber: string | null; busyStatus: string | null; payRate?: number | null; payType?: string }
```

- [ ] **Step 3.2: Add `durationHours` state**

Find the block with `distanceKm` state (around line 171):

```ts
const [distanceKm,     setDistanceKm]     = useState<number | null>(null)
```

Add `durationHours` directly below it:

```ts
const [distanceKm,     setDistanceKm]     = useState<number | null>(null)
const [durationHours,  setDurationHours]  = useState<number | null>(null)
```

- [ ] **Step 3.3: Update `calcDist` to also extract and store duration**

Find the `calcDist` function (around line 174). Currently it only calls `setDistanceKm`. Replace the block that reads from the Mapbox response:

```ts
const route = data?.routes?.[0]
if (route) setDistanceKm(Math.round(route.distance / 1000))
```

with:

```ts
const route = data?.routes?.[0]
if (route) {
  setDistanceKm(Math.round(route.distance / 1000))
  setDurationHours(route.duration / 3600)
}
```

- [ ] **Step 3.4: Reset `durationHours` when coordinates are missing**

Find the two callbacks `onPickup` and `onDelivery` (around lines 189–199). Each has `else setDistanceKm(null)`. Add the duration reset alongside:

In `onPickup`:
```ts
else { setDistanceKm(null); setDurationHours(null) }
```

In `onDelivery`:
```ts
else { setDistanceKm(null); setDurationHours(null) }
```

- [ ] **Step 3.5: Commit**

```bash
git add client/src/features/orders/CreateOrderPage.tsx
git commit -m "feat: store Mapbox route duration in durationHours state for salary calc"
```

---

## Task 4: Frontend — Salary auto-calc useEffect + salaryCalcNote state

**Files:**
- Modify: `client/src/features/orders/CreateOrderPage.tsx`

- [ ] **Step 4.1: Add `salaryCalcNote` state**

Find the existing `fuelCalcNote` state declaration (around line 204):

```ts
const [fuelCalcNote, setFuelCalcNote] = useState<string | null>(null)
```

Add `salaryCalcNote` directly below it:

```ts
const [fuelCalcNote,   setFuelCalcNote]   = useState<string | null>(null)
const [salaryCalcNote, setSalaryCalcNote] = useState<string | null>(null)
```

- [ ] **Step 4.2: Add the salary auto-calc useEffect**

Find the existing fuel cost `useEffect` that ends around line 248 (it depends on `form.vehicleId`, `form.executionType`, `distanceKm`, `fuelPrices`). Add the salary `useEffect` directly **after** it:

```ts
/* ── auto-calc salary cost ──────────────────────────── */
useEffect(() => {
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
    calc = Math.round(payRate)
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
```

- [ ] **Step 4.3: Verify TypeScript compiles cleanly**

```bash
cd client && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4.4: Commit**

```bash
git add client/src/features/orders/CreateOrderPage.tsx
git commit -m "feat: auto-calculate estimatedSalaryCost on driver selection"
```

---

## Task 5: Frontend — Salary hint UI

**Files:**
- Modify: `client/src/features/orders/CreateOrderPage.tsx`

- [ ] **Step 5.1: Update the salary field label and onChange to clear the hint**

Find the `estimatedSalaryCost` input block (around line 773–776):

```tsx
<div className="co__field">
  <label className="co__label">Зарплата водія (₴)</label>
  <input type="number" min="0" className="co__input" value={form.estimatedSalaryCost} onChange={(e) => set('estimatedSalaryCost', e.target.value)} placeholder="0" />
</div>
```

Replace with:

```tsx
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
```

- [ ] **Step 5.2: Verify TypeScript compiles cleanly**

```bash
cd client && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5.3: Manual smoke test**

Start the dev server and open the contract creation form:
1. Set INTERNAL execution type.
2. Enter pickup and delivery addresses with coordinates (e.g. Київ → Харків) — wait for `distanceKm` to appear in the badge.
3. Select a driver that has `pay_rate` set in the DB.
4. Verify `estimatedSalaryCost` auto-fills and a hint appears below the field.
5. Edit the salary field manually — verify the hint disappears.
6. Switch driver to "— не призначено —" — verify salary field clears.
7. Switch to EXTERNAL execution — verify salary field is hidden (existing behaviour).

- [ ] **Step 5.4: Commit**

```bash
git add client/src/features/orders/CreateOrderPage.tsx
git commit -m "feat: show salary auto-calc badge and hint in contract form"
```
