# Staff Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the hospital orderly management system to use the new `Staff` database model instead of `Orderly` in the database, APIs, UI hooks, seed script, and testing suites.

**Architecture:** We will replace all database references to `prisma.orderly` with `prisma.staff`. We will update the real-time sync hook definitions and usage to listen to the `'Staff'` table, fix the TypeScript payload structures in JWT tests, and resolve UI test issues so that the application compiles and passes all unit tests successfully.

**Tech Stack:** Next.js (App Router), Prisma ORM, React (v19), Tailwind CSS, Jest.

---

### Task 1: Update Realtime Sync types and page integrations

**Files:**
- Modify: [src/lib/useRealtimeSync.ts](file:///d:/OneDrive/desktop/Laundry/src/lib/useRealtimeSync.ts)
- Modify: [src/app/admin/page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)

- [ ] **Step 1: Update Realtime sync table type**
Modify `src/lib/useRealtimeSync.ts` to replace `'Orderly'` with `'Staff'` in the `RealtimeTable` type union.
```typescript
type RealtimeTable = 'Staff' | 'Khoa' | 'LinenType' | 'Batch' | 'LinenCirculation' | 'LinenDiscardLog' | 'Ticket' | 'TicketItem' | 'User'
```

- [ ] **Step 2: Update admin dashboard Realtime sync subscription**
Modify `src/app/admin/page.tsx` in the `useRealtimeSync` hook instantiation to listen to `'Staff'` instead of `'Orderly'`.
```typescript
  // Supabase Realtime: auto-refresh when DB changes
  useRealtimeSync(
    ['LinenType', 'Khoa', 'Staff'],
    () => {
      fetchLinenTypes()
      fetchWards()
      fetchOrderlies()
    },
    'admin-dashboard-sync'
  )
```

- [ ] **Step 3: Commit**
```bash
git add src/lib/useRealtimeSync.ts src/app/admin/page.tsx
git commit -m "refactor: update realtime sync subscription and types to use Staff"
```

---

### Task 2: Refactor Orderlies Admin route API

**Files:**
- Modify: [src/app/api/admin/orderlies/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/orderlies/route.ts)

- [ ] **Step 1: Update Prisma model reference to staff in GET, POST, and DELETE methods**
Modify `src/app/api/admin/orderlies/route.ts` to replace `prisma.orderly` with `prisma.staff`.
Under GET:
```typescript
    const orderlies = await prisma.staff.findMany({
      orderBy: { name: 'asc' },
    })
```
Under POST:
```typescript
    const existing = await prisma.staff.findUnique({
      where: { name: name.trim() },
    })
```
And:
```typescript
    const newOrderly = await prisma.staff.create({
      data: { name: name.trim() },
    })
```
Under DELETE:
```typescript
    await prisma.staff.delete({
      where: { id },
    })
```

- [ ] **Step 2: Commit**
```bash
git add src/app/api/admin/orderlies/route.ts
git commit -m "api: update admin orderlies endpoint to query staff model"
```

---

### Task 3: Refactor Ward Request route API

**Files:**
- Modify: [src/app/api/request/order/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/request/order/route.ts)

- [ ] **Step 1: Update Prisma model reference to staff in GET method**
Modify `src/app/api/request/order/route.ts` to query `prisma.staff` instead of `prisma.orderly`.
```typescript
    // Fetch active orderlies
    const orderlies = await prisma.staff.findMany({
      orderBy: { name: 'asc' },
    })
```

- [ ] **Step 2: Commit**
```bash
git add src/app/api/request/order/route.ts
git commit -m "api: update request order endpoint to fetch active staff list"
```

---

### Task 4: Refactor Database Seed Script

**Files:**
- Modify: [prisma/seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts)

- [ ] **Step 1: Update seed database calls for orderlies to use staff model**
Modify `prisma/seed.ts` to replace `prisma.orderly` references with `prisma.staff`.
```typescript
  // Clean up staff (previously orderlies)
  await prisma.staff.deleteMany({});
  
  // Seed staff (orderlies)
  const orderlies = [
    { name: 'Nguyễn Văn Hộ lý' },
    { name: 'Trần Thị Hộ lý' },
    { name: 'Lê Văn Hộ lý' },
  ];
  for (const o of orderlies) {
    await prisma.staff.create({ data: o });
  }
```

- [ ] **Step 2: Run Prisma seed to verify database updates**
Run:
```powershell
powershell -ExecutionPolicy Bypass -Command "npx prisma db seed"
```
Or if seed script is configured manually:
```powershell
powershell -ExecutionPolicy Bypass -Command "npx tsx -r dotenv/config prisma/seed.ts"
```
Expected output: "Database seeding finished successfully."

- [ ] **Step 3: Commit**
```bash
git add prisma/seed.ts
git commit -m "db: update database seed script to seed staff model"
```

---

### Task 5: Refactor Test Suites and Type Fixes

**Files:**
- Modify: [src/__tests__/orderlies-api.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/orderlies-api.test.ts)
- Modify: [src/__tests__/auth.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/auth.test.ts)
- Modify: [src/__tests__/dispatch-ui.test.tsx](file:///d:/OneDrive/desktop/Laundry/src/__tests__/dispatch-ui.test.tsx)
- Modify: [src/__tests__/login-ui.test.tsx](file:///d:/OneDrive/desktop/Laundry/src/__tests__/login-ui.test.tsx)

- [ ] **Step 1: Refactor orderlies API test to query staff**
Modify `src/__tests__/orderlies-api.test.ts` to use `prisma.staff` instead of `prisma.orderly`.
```typescript
    const check = await prisma.staff.findUnique({ where: { id: orderlyId } })
```

- [ ] **Step 2: Fix JWT test role type signatures**
Modify `src/__tests__/auth.test.ts` to cast the roles to strict literal types.
```typescript
    const payload = { userId: '123', username: 'admin', role: 'ADMIN' as const };
```
And:
```typescript
    const payload = { userId: '456', username: 'laundry', role: 'LAUNDRY' as const };
```

- [ ] **Step 3: Add jest-dom imports to UI tests to fix TypeScript compile issues**
Add `@testing-library/jest-dom` import at the top of:
- `src/__tests__/dispatch-ui.test.tsx`
- `src/__tests__/login-ui.test.tsx`
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Run complete Jest test suite**
Run:
```powershell
powershell -ExecutionPolicy Bypass -Command "npm test"
```
Expected: All 12/12 test suites passing successfully.

- [ ] **Step 5: Run production build verification**
Run:
```powershell
powershell -ExecutionPolicy Bypass -Command "npx tsc --noEmit"
```
And:
```powershell
powershell -ExecutionPolicy Bypass -Command "npm run build"
```
Expected: Compilation completes without any errors.

- [ ] **Step 6: Commit**
```bash
git add src/__tests__/orderlies-api.test.ts src/__tests__/auth.test.ts src/__tests__/dispatch-ui.test.tsx src/__tests__/login-ui.test.tsx
git commit -m "test: refactor test suites, typecheck and verify all tests pass"
```
