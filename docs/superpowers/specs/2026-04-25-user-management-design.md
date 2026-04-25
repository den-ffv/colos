# User Management Page — Design Spec

**Date:** 2026-04-25  
**Feature:** Admin page for creating and managing employee accounts  
**Approach:** Table + Modal dialog

---

## Overview

A new "Співробітники" section accessible only to `ADMIN` role. The admin can:
- View all user accounts in the company
- Create new accounts with manually set passwords and multiple roles
- Edit existing accounts (name, roles, driver link, password optionally)
- Activate/deactivate accounts

---

## Backend

### Router

New file: `server/src/router/users.router.ts`  
Mounted at: `/api/users`  
All endpoints protected by `requireRole('ADMIN')` middleware.  
All queries scoped to `company_id` from JWT.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List company users with pagination and search |
| `POST` | `/api/users` | Create user with roles and optional driver link |
| `PUT` | `/api/users/:id` | Update name, roles, driver link, optional password |
| `PATCH` | `/api/users/:id/status` | Toggle `is_active` |

### POST /api/users — Logic

1. Zod validation: `email`, `password` (min 6 chars), `first_name`, `last_name`, `roles: Role[]` (min 1), optional `driverId: string`
2. Check email uniqueness within company → 409 if duplicate
3. Bcrypt hash password (10 rounds)
4. `prisma.$transaction`:
   - Create `User`
   - `createMany` records in `UserRole`
   - If `DRIVER` in roles and `driverId` provided → `Driver.update({ user_id })` (verify driver belongs to same company)

### PUT /api/users/:id — Logic

1. Zod validation: same fields, password optional (empty string = skip)
2. Block self-deactivation via status field
3. `prisma.$transaction`:
   - Update `User` fields (+ password hash if provided)
   - `deleteMany` existing `UserRole` + `createMany` new ones
   - If `DRIVER` in new roles and `driverId` provided → `Driver.update({ user_id })`
   - If `driverId` explicitly set to `null` in payload → `Driver.update({ user_id: null })` for previously linked driver (admin cleared the driver field)
   - If `driverId` field absent from payload → leave existing driver link unchanged
   - If `DRIVER` removed from roles but driver still linked → **no automatic unlink** (frontend shows warning only)

### PATCH /api/users/:id/status — Logic

1. Block if `req.user.id === id` (admin cannot deactivate themselves)
2. Block deactivation if this is the last active `ADMIN` in the company
3. Toggle `is_active`

### GET /api/users — Response shape

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "...",
      "first_name": "...",
      "last_name": "...",
      "is_active": true,
      "roles": ["LOGIST", "MANAGER"],
      "driverProfile": { "id": "uuid", "first_name": "...", "last_name": "..." } | null,
      "created_at": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## Frontend

### Navigation

Add `'users'` to `CrmView` type in `CrmShell.tsx`.  
Add nav item "Співробітники" visible only for `ADMIN` role.

### File Structure

```
client/src/features/users/
├── UsersPage.tsx       — table with list and action buttons
├── UserModal.tsx       — create/edit modal form
└── useUsers.ts         — data fetching and mutation hooks
```

### UsersPage

Table columns: **Ім'я**, **Email**, **Ролі** (badge per role), **Водій** (driver name or "—"), **Статус** (Активний/Неактивний chip), **Дії** (edit icon, toggle status icon).

- "Створити співробітника" button → opens `UserModal` in create mode
- Edit icon → opens `UserModal` in edit mode with pre-filled data
- Toggle icon → shows confirm dialog → PATCH status

### UserModal — Fields

| Field | Type | Notes |
|-------|------|-------|
| `first_name` | text input | required |
| `last_name` | text input | required |
| `email` | email input | required |
| `password` | password input | required on create; optional on edit (placeholder: "Залишити порожнім щоб не змінювати") |
| `roles` | checkboxes | all 6 roles; min 1 required |
| `driverId` | dropdown | shown only when `DRIVER` checkbox is checked |

**Driver dropdown population:**
- Fetches `/api/drivers` filtered to drivers with `user_id = null`
- In edit mode: also includes the currently linked driver (so it appears in the list)

**Warning banner (edit mode only):**  
If `DRIVER` role is unchecked but the user still has a linked driver → show yellow banner:  
_"Роль DRIVER знято, але водій [Ім'я] залишається прив'язаним до цього акаунту. Від'єднайте водія вручну якщо необхідно."_

---

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| Duplicate email in company | Backend returns 409; form shows error under email field |
| Admin deactivates themselves | Backend blocks with 403 |
| Last active ADMIN deactivated | Backend blocks with 403 |
| Driver already linked to another user | Not shown in dropdown |
| DRIVER role removed, driver still linked | Yellow warning in form; save is allowed |
| `driverId` passed but driver belongs to another company | Backend returns 400 |

---

## Authorization Summary

- All `/api/users` routes require `ADMIN` role
- All queries filtered by `company_id` from JWT — no cross-company data leakage
- Self-deactivation blocked at backend level
