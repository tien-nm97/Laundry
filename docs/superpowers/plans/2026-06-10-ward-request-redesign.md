# Ward Request Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Ward Request Portal to allow dynamic linen requests using QR codes with orderly selection, and provide admin management of the hospital orderlies.

**Architecture:** We will add an `Orderly` model to Prisma, map it to a CRUD panel in `/admin`, update `/api/admin/orderlies` routes with JWT authorization checks, add `requesterName` to `Ticket`, update `/api/request/order` to return orderlies and handle `requesterName`, and rewrite the UI layout of `/request/order` to handle a dynamic form.

**Tech Stack:** Next.js (App Router), Prisma ORM, React (v19), Tailwind CSS.

---

### Task 1: Prisma Schema Updates and Database Migration

**Files:**
- Modify: [schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma)
- Modify: [seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts)

- [ ] **Step 1: Update Prisma schema**
Modify `prisma/schema.prisma` to add the `Orderly` model and add `requesterName` (String) to the `Ticket` model.
```prisma
model Orderly {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}

model Ticket {
  id            String       @id @default(uuid())
  wardId        String
  ward          Ward         @relation(fields: [wardId], references: [id])
  status        TicketStatus @default(PENDING)
  requesterName String
  deliveryDate  DateTime
  createdAt     DateTime     @default(now())
  items         TicketItem[]
}
```

- [ ] **Step 2: Update Seed Script**
Modify `prisma/seed.ts` to clear and seed orderlies (e.g. "Nguyễn Văn Hộ lý", "Trần Thị Hộ lý"), and update mock tickets to include `requesterName: 'Nguyễn Văn Hộ lý'`.
```typescript
  // Clean up orderlies
  await prisma.orderly.deleteMany({});
  
  // Seed orderlies
  const orderlies = [
    { name: 'Nguyễn Văn Hộ lý' },
    { name: 'Trần Thị Hộ lý' },
    { name: 'Lê Văn Hộ lý' },
  ];
  for (const o of orderlies) {
    await prisma.orderly.create({ data: o });
  }
  
  // Under step 5 seed mock pending tickets, update:
  await prisma.ticket.create({
    data: {
      wardId: ward.id,
      status: 'PENDING',
      requesterName: 'Nguyễn Văn Hộ lý',
      deliveryDate: new Date(),
      items: {
        create: mt.items.filter(item => item.linenTypeId !== '')
      }
    }
  });
```

- [ ] **Step 3: Run database migration and seed**
Clean dev server cache and migrate database.
Run:
```powershell
npx.cmd prisma db push
npx.cmd tsx -r dotenv/config prisma/seed.ts
```
Expected output: "Database seeding finished successfully."

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/seed.ts
git commit -m "db: add Orderly model and requesterName to Ticket"
```

---

### Task 2: Orderly Management Admin APIs

**Files:**
- Create: [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/orderlies/route.ts)
- Test: [orderlies-api.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/orderlies-api.test.ts)

- [ ] **Step 1: Write the failing test for orderlies API**
Create `src/__tests__/orderlies-api.test.ts` to test GET, POST, and DELETE requests for `/api/admin/orderlies`.
```typescript
/**
 * @jest-environment node
 */
import { GET, POST, DELETE } from '../app/api/admin/orderlies/route'
import { signToken } from '../lib/jwt'
import { prisma } from '../lib/db'

describe('Admin Orderlies API', () => {
  let adminToken: string
  let orderlyId: string

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long'
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
  })

  const createRequest = (method: string, body?: any, token?: string, searchParams?: URLSearchParams) => {
    let url = 'http://localhost/api/admin/orderlies'
    if (searchParams) {
      url += `?${searchParams.toString()}`
    }
    const headers: Record<string, string> = {}
    if (body) headers['Content-Type'] = 'application/json'
    if (token) headers['Cookie'] = `token=${token}`
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }) as any
  }

  it('should create an orderly', async () => {
    const req = createRequest('POST', { name: 'Test Orderly A' }, adminToken)
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('Test Orderly A')
    orderlyId = data.id
  })

  it('should list all orderlies', async () => {
    const req = createRequest('GET', undefined, adminToken)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.some((o: any) => o.name === 'Test Orderly A')).toBe(true)
  })

  it('should delete an orderly', async () => {
    const params = new URLSearchParams({ id: orderlyId })
    const req = createRequest('DELETE', undefined, adminToken, params)
    const res = await DELETE(req)
    expect(res.status).toBe(200)

    const check = await prisma.orderly.findUnique({ where: { id: orderlyId } })
    expect(check).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run:
```powershell
npx.cmd jest src/__tests__/orderlies-api.test.ts
```
Expected: FAIL with module/route import error.

- [ ] **Step 3: Implement Orderlies Route**
Create `src/app/api/admin/orderlies/route.ts`:
```typescript
import { prisma } from '@/lib/db'
import { verifyAdminRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const orderlies = await prisma.orderly.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(orderlies)
  } catch (error: any) {
    console.error('GET orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách hộ lý' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { name } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Tên hộ lý là bắt buộc' },
        { status: 400 }
      )
    }

    const existing = await prisma.orderly.findUnique({
      where: { name: name.trim() },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Hộ lý này đã tồn tại trong danh sách' },
        { status: 400 }
      )
    }

    const newOrderly = await prisma.orderly.create({
      data: { name: name.trim() },
    })

    return NextResponse.json(newOrderly, { status: 201 })
  } catch (error: any) {
    console.error('POST orderlies error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo hộ lý mới' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID hộ lý cần xóa' }, { status: 400 })
    }

    await prisma.orderly.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Xóa hộ lý thành công' })
  } catch (error: any) {
    console.error('DELETE orderly error:', error)
    return NextResponse.json({ error: 'Lỗi khi xóa hộ lý' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests and make sure they pass**
Run:
```powershell
npx.cmd jest src/__tests__/orderlies-api.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/__tests__/orderlies-api.test.ts src/app/api/admin/orderlies/route.ts
git commit -m "api: create orderly management endpoints"
```

---

### Task 3: Update Ward Request Endpoint with Orderlies Support

**Files:**
- Modify: [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/request/order/route.ts)
- Modify: [request.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/request.test.ts)

- [ ] **Step 1: Update request.test.ts test suite**
Modify `src/__tests__/request.test.ts` to include `requesterName` in POST requests, and check that `orderlies` are returned in GET.
```typescript
      // In GET:
      const data = await res.json()
      expect(data.ward.name).toBe(testWard.name)
      expect(Array.isArray(data.linenTypes)).toBe(true)
      expect(Array.isArray(data.orderlies)).toBe(true)

      // In POST:
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'Nguyễn Văn Hộ lý',
        items: [
          {
            linenTypeId: testLinenType.id,
            quantity: 15,
          },
        ],
      }
```

- [ ] **Step 2: Run test to verify it fails**
Run:
```powershell
npx.cmd jest src/__tests__/request.test.ts
```
Expected: FAIL on GET (missing `orderlies`) and POST (validation errors or missing `requesterName`).

- [ ] **Step 3: Update Order Route API**
Modify `src/app/api/request/order/route.ts`:
- Under GET: fetch active orderlies list ordered alphabetically and return it as `orderlies`.
- Under POST: extract `requesterName` from request body, validate it is a non-empty string, and write it into the Ticket creation data payload.
```typescript
    // Under GET, fetch active orderlies:
    const orderlies = await prisma.orderly.findMany({
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      ward: {
        id: ward.id,
        name: ward.name,
      },
      linenTypes,
      orderlies,
    })

    // Under POST:
    const { wardId, token, requesterName, items } = body
    if (!requesterName || typeof requesterName !== 'string' || !requesterName.trim()) {
      return NextResponse.json(
        { error: 'Thiếu thông tin người yêu cầu (Hộ lý)' },
        { status: 400 }
      )
    }

    // Under Ticket create:
    const ticket = await tx.ticket.create({
      data: {
        wardId: ward.id,
        status: 'PENDING',
        requesterName: requesterName.trim(),
        deliveryDate: new Date(),
        items: {
          create: items.map((item: any) => ({
            linenTypeId: item.linenTypeId,
            quantity: Number(item.quantity),
          })),
        },
      },
```

- [ ] **Step 4: Run tests to verify they pass**
Run:
```powershell
npx.cmd jest src/__tests__/request.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/request/order/route.ts src/__tests__/request.test.ts
git commit -m "api: return orderly list and accept requesterName in ticket requests"
```

---

### Task 4: Admin UI Orderly Management Panel

**Files:**
- Modify: [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)

- [ ] **Step 1: Redesign Admin Main Page UI**
Add a third card panel for managing hospital orderlies (Quản lý Hộ lý), allowing staff creation and deletion.
```tsx
  // Add state hooks for orderlies:
  const [orderlies, setOrderlies] = useState<any[]>([])
  const [orderlyName, setOrderlyName] = useState('')
  const [loadingOrderlies, setLoadingOrderlies] = useState(true)
  const [submittingOrderly, setSubmittingOrderly] = useState(false)

  // Fetch hook:
  const fetchOrderlies = async () => {
    setLoadingOrderlies(true)
    try {
      const res = await fetch('/api/admin/orderlies')
      if (res.ok) {
        const data = await res.json()
        setOrderlies(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingOrderlies(false)
    }
  }

  // Handle post hook:
  const handleCreateOrderly = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderlyName.trim()) return

    setSubmittingOrderly(true)
    try {
      const res = await fetch('/api/admin/orderlies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orderlyName.trim() }),
      })
      const data = await res.json()

      if (res.ok) {
        setOrderlyName('')
        showFeedback('success', `Đã thêm hộ lý: ${data.name}`)
        fetchOrderlies()
      } else {
        showFeedback('error', data.error || 'Lỗi khi thêm hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    } finally {
      setSubmittingOrderly(false)
    }
  }

  // Handle delete hook:
  const handleDeleteOrderly = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa hộ lý này không?')) return
    try {
      const res = await fetch(`/api/admin/orderlies?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Đã xóa hộ lý thành công')
        fetchOrderlies()
      } else {
        showFeedback('error', data.error || 'Lỗi khi xóa hộ lý')
      }
    } catch (err) {
      showFeedback('error', 'Lỗi kết nối hệ thống')
    }
  }

  // Add fetchOrderlies to useEffect, and update grid panels to grid-cols-1 lg:grid-cols-3
```

Update grid to three columns on desktop. Insert third panel:
```tsx
        {/* Panel 3: Orderlies */}
        <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Quản lý Nhân viên Hộ lý
          </h2>

          <form onSubmit={handleCreateOrderly} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
            <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm hộ lý mới</h3>
            <div>
              <label className="block text-xxs text-slate-500 mb-1 font-semibold">Họ và tên nhân viên</label>
              <input
                type="text"
                value={orderlyName}
                onChange={(e) => setOrderlyName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn A..."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submittingOrderly}
              className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
            >
              Thêm nhân viên
            </button>
          </form>

          <div className="flex-1 overflow-auto max-h-[350px]">
            {loadingOrderlies ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
            ) : orderlies.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có hộ lý.</div>
            ) : (
              <div className="overflow-hidden border border-slate-200/80 rounded-xl">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 font-bold text-slate-500">Họ tên nhân viên</th>
                      <th className="px-4 py-3 font-bold text-slate-500 w-20 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {orderlies.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">{o.name}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteOrderly(o.id)}
                            className="text-rose-600 hover:text-rose-800 font-bold transition-colors cursor-pointer"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
```

- [ ] **Step 2: Verify compiling**
Run:
```powershell
npm.cmd run build
```
Expected: PASS with no TS compilation errors.

- [ ] **Step 3: Commit**
```bash
git add src/app/admin/page.tsx
git commit -m "fe: add orderly management CRUD UI to admin panel"
```

---

### Task 5: Redesign Ward Request Portal

**Files:**
- Modify: [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/request/order/page.tsx)

- [ ] **Step 1: Implement Dynamic Rows and Staff dropdown UI**
Update `src/app/request/order/page.tsx` to:
1. Load orderlies and store in state `orderlies`.
2. State for `requesterName` (string).
3. State for `rows`: `{ linenTypeId: string, quantity: number }[]`, default is `[{ linenTypeId: '', quantity: 1 }]`.
4. Dynamic rendering of rows using a table/list-like design, including a `-` / `×` button for removing rows.
5. Large `+` button to add new row.
6. Submit ticket logic sending `requesterName` and dynamic `items`.
Let's construct the core form component code structure:
```tsx
  const [orderlies, setOrderlies] = useState<any[]>([])
  const [requesterName, setRequesterName] = useState('')
  const [rows, setRows] = useState<{ linenTypeId: string; quantity: number }[]>([
    { linenTypeId: '', quantity: 1 },
  ])

  // In validateAndFetch:
  setWard(data.ward)
  setLinenTypes(data.linenTypes)
  setOrderlies(data.orderlies)

  // In handleSubmit:
  // Validate requesterName is selected
  // Validate rows are fully selected with valid quantities
```

Render details:
- A requester dropdown:
```tsx
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Nhân viên yêu cầu (Hộ lý) <span className="text-red-500">*</span>
            </label>
            <select
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
              required
            >
              <option value="">-- Chọn nhân viên yêu cầu --</option>
              {orderlies.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
```
- Dynamic list section:
```tsx
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <select
                      value={row.linenTypeId}
                      onChange={(e) => {
                        const newRows = [...rows]
                        newRows[index].linenTypeId = e.target.value
                        setRows(newRows)
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                    >
                      <option value="">-- Chọn loại đồ vải --</option>
                      {linenTypes.map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.name} ({lt.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        const newRows = [...rows]
                        newRows[index].quantity = val as number
                        setRows(newRows)
                      }}
                      placeholder="SL"
                      className="w-full text-center border border-slate-200 rounded-xl py-3 text-sm font-bold text-slate-950 focus:outline-none focus:border-[#0066b2]"
                    />
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      className="w-11 h-11 bg-rose-50 border border-rose-100 hover:bg-rose-100/70 text-rose-600 rounded-xl flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRows([...rows, { linenTypeId: '', quantity: 1 }])}
              className="w-full border-2 border-dashed border-[#0066b2]/30 hover:border-[#0066b2]/60 hover:bg-[#0066b2]/5 text-[#0066b2] font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="text-base">⊕</span> Thêm loại đồ vải khác
            </button>
```

- [ ] **Step 2: Verify compiling**
Run:
```powershell
npm.cmd run build
```
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/app/request/order/page.tsx
git commit -m "fe: redesign ward request page with dropdown lookup and dynamic rows"
```

---

### Task 6: Final Verification & Test Runs

**Files:**
- None

- [ ] **Step 1: Run complete test suite**
Run:
```powershell
npm.cmd test
```
Expected: All 12/12 suites passing.

- [ ] **Step 2: Run production compilation**
Run:
```powershell
npm.cmd run build
```
Expected: Builds without warnings or errors.

- [ ] **Step 3: Clean up and commit**
If any temporary changes were left, commit them.
```bash
git status
```
