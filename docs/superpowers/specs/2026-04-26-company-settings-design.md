# Company Settings Page — Design Spec

**Date:** 2026-04-26  
**Status:** Approved

## Overview

A dedicated "Company Settings" page that displays the current user's company details and allows an ADMIN to edit them. Every user belongs to exactly one company (encoded in the JWT as `company_id`), so there is no multi-company listing — the page always shows the caller's own company.

## Backend

### New router: `server/src/router/companies.router.ts`

Mounted in `api.router.ts` at `/companies`.

#### `GET /companies/me`

- Middleware: `requireAuth` (any role)
- Reads `company_id` from `req.auth` (JWT payload)
- Returns a single company DTO:

```ts
{
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  hasOwnFleet: boolean
  operationMode: 'OWN_FLEET' | 'BROKER' | 'HYBRID'
  usesBrokerServices: boolean
  createdAt: string
  updatedAt: string
}
```

#### `PUT /companies/me`

- Middleware: `requireAuth` + `authorize(['ADMIN'])`
- `company_id` is taken **exclusively from the JWT** — never from the request body
- Zod schema validates body fields (all optional, at least one required):
  - `name` — non-empty string
  - `email` — nullable string (email format or null)
  - `phone` — nullable string
  - `address` — nullable string
  - `hasOwnFleet` — boolean
  - `operationMode` — `'OWN_FLEET' | 'BROKER' | 'HYBRID'`
  - `usesBrokerServices` — boolean
- Returns the updated company DTO on success
- Returns `400` on validation failure, `403` if caller is not ADMIN

### Security

- `company_id` is never accepted from the request body on write — enforced by the route handler
- A non-ADMIN receives `403` before any database access

## Frontend

### New page: `client/src/features/company/CompanyPage.tsx`

#### Table view

- Single-row table with columns: Name, Email, Phone, Address, Operation Mode, Own Fleet, Broker Services
- "Edit" button visible only when the caller has role `ADMIN` (checked via `tryGetRolesFromJwt`)
- Matches the visual and structural pattern of `ClientsPage` / `CarriersPage`

#### Drawer (edit form)

- Opens on "Edit" click
- Fields: Name (required), Email, Phone, Address, Operation Mode (select), Has Own Fleet (checkbox), Uses Broker Services (checkbox)
- "Save" calls `PUT /companies/me`; on success closes the drawer and refreshes table data
- "Cancel" closes without saving
- Inline error message shown below the form if the server returns an error; drawer stays open

#### Navigation

- New sidebar entry "Компанія" in the CRM nav, visible to all roles (everyone can view, only ADMIN sees the Edit button)

## Data Flow

```
CompanyPage mounts
  → GET /companies/me
  → render single-row table

User (ADMIN) clicks Edit
  → Drawer opens, prefilled with current data

User submits form
  → PUT /companies/me { name, email, phone, ... }
  → on 200: close drawer, refresh GET /companies/me
  → on 4xx: show inline error, keep drawer open
```

## Out of Scope

- Creating or deleting companies (done at registration time)
- Super-admin cross-company management (no such role exists)
- Company logo / branding upload
