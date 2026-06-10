# Becamex-Style Laundry Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Hospital Linen Management & Distribution System UI to match the Becamex Operations system's light theme, typography, and split-screen layouts, and add a public, passwordless daily dispatch view (`/laundry/dispatch`) for preparation and fast delivery.

**Architecture:** 
- Exclude the `/laundry/dispatch` page and `/api/dispatch/tickets` API route from the middleware authentication logic.
- Create `/api/dispatch/tickets` handling public GET (pending tickets) and PUT (deliver ticket).
- Design `/laundry/dispatch` as a light theme split-screen interface displaying summed required stock on the left (30% width) and pending ward tickets on the right (70% width).
- Apply Becamex style design tokens (light slate background `#f3f6f9`, Becamex blue `#0066b2`, white panel card backgrounds, dark slate text, dark capsule tabs `#1e293b`) across all frontend pages (`/login`, `/request/order`, `/admin`, `/laundry`).

**Tech Stack:** Next.js App Router, TailwindCSS v4, Prisma Client, Jest

---

### Task 1: Public Dispatch API

**Files:**
- Create: `src/app/api/dispatch/tickets/route.ts`
- Test: `src/__tests__/dispatch-api.test.ts`

- [ ] **Step 1: Write the failing test**
  Create `src/__tests__/dispatch-api.test.ts` to test GET and PUT endpoints for the public dispatch route.
  ```typescript
  /**
   * @jest-environment node
   */
  import { GET, PUT } from '../app/api/dispatch/tickets/route'
  import { prisma } from '../lib/db'

  describe('Public Dispatch Tickets API', () => {
    let testWard: any
    let testLinenType: any
    let testTicket: any

    beforeAll(async () => {
      testWard = await prisma.ward.findFirst()
      testLinenType = await prisma.linenType.findFirst()

      testTicket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PENDING',
          deliveryDate: new Date(),
          items: {
            create: [
              { linenTypeId: testLinenType.id, quantity: 8 },
            ],
          },
        },
      })
    })

    afterAll(async () => {
      if (testTicket) {
        await prisma.ticket.deleteMany({
          where: { id: testTicket.id },
        })
      }
    })

    it('should return pending tickets with status 200', async () => {
      const req = new Request('http://localhost/api/dispatch/tickets')
      const res = await GET(req as any)
      expect(res.status).toBe(200)

      const tickets = await res.json()
      expect(Array.isArray(tickets)).toBe(true)
      expect(tickets.some((t: any) => t.id === testTicket.id)).toBe(true)
    })

    it('should mark a ticket as delivered via PUT', async () => {
      const req = new Request('http://localhost/api/dispatch/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: testTicket.id }),
      })
      const res = await PUT(req as any)
      expect(res.status).toBe(200)

      const updated = await res.json()
      expect(updated.status).toBe('DELIVERED')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd jest src/__tests__/dispatch-api.test.ts`
  Expected: FAIL (Cannot find module or compilation error)

- [ ] **Step 3: Write minimal implementation**
  Create `src/app/api/dispatch/tickets/route.ts`:
  ```typescript
  import { prisma } from '@/lib/db'
  import { NextResponse } from 'next/server'

  export async function GET(request: Request) {
    try {
      const tickets = await prisma.ticket.findMany({
        where: { status: 'PENDING' },
        include: {
          ward: true,
          items: {
            include: {
              linenType: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(tickets)
    } catch (error: any) {
      console.error('GET public tickets error:', error)
      return NextResponse.json({ error: 'Lỗi tải danh sách phiếu' }, { status: 500 })
    }
  }

  export async function PUT(request: Request) {
    try {
      const body = await request.json()
      const { ticketId } = body

      if (!ticketId) {
        return NextResponse.json({ error: 'Thiếu mã phiếu' }, { status: 400 })
      }

      const updatedTicket = await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'DELIVERED',
          deliveryDate: new Date(),
        },
        include: {
          items: {
            include: {
              linenType: true,
            },
          },
        },
      })
      return NextResponse.json(updatedTicket)
    } catch (error: any) {
      console.error('PUT public ticket error:', error)
      return NextResponse.json({ error: 'Lỗi cập nhật phiếu' }, { status: 500 })
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd jest src/__tests__/dispatch-api.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/__tests__/dispatch-api.test.ts src/app/api/dispatch/tickets/route.ts
  git commit -m "feat: add public dispatch API endpoints"
  ```

---

### Task 2: Route Middleware Configuration

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/__tests__/middleware.test.ts`

- [ ] **Step 1: Write the failing test**
  Modify `src/__tests__/middleware.test.ts` to assert that unauthenticated requests to `/laundry/dispatch` are bypassed (return no redirect).
  ```diff
    it('should allow LAUNDRY users to access /laundry', async () => {
      const req = createMockRequest('http://localhost/laundry', laundryToken);
      const res = await middleware(req);
      if (res) {
        expect(res.headers.get('location')).toBeNull();
      }
    });
  
+   it('should bypass auth check for public dispatch page /laundry/dispatch', async () => {
+     const req = createMockRequest('http://localhost/laundry/dispatch');
+     const res = await middleware(req);
+     if (res) {
+       expect(res.headers.get('location')).toBeNull();
+     } else {
+       expect(res).toBeUndefined();
+     }
+   });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd jest src/__tests__/middleware.test.ts`
  Expected: FAIL (it redirects `/laundry/dispatch` to `/login`)

- [ ] **Step 3: Write minimal implementation**
  Modify `src/middleware.ts` to bypass `/laundry/dispatch` and `/api/dispatch/tickets` routes.
  ```typescript
  import { NextResponse } from 'next/server'
  import type { NextRequest } from 'next/server'
  import { verifyToken } from './lib/jwt'

  export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Skip auth for public dispatch route and its API
    if (pathname.startsWith('/laundry/dispatch') || pathname.startsWith('/api/dispatch')) {
      return NextResponse.next()
    }

    const isProtectedAdmin = pathname.startsWith('/admin')
    const isProtectedLaundry = pathname.startsWith('/laundry')

    if (isProtectedAdmin || isProtectedLaundry) {
      const tokenCookie = request.cookies.get('token')
      const token = tokenCookie?.value

      if (!token) {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }

      const payload = await verifyToken(token)
      if (!payload) {
        const loginUrl = new URL('/login', request.url)
        const response = NextResponse.redirect(loginUrl)
        response.cookies.delete('token')
        return response
      }

      if (isProtectedAdmin && payload.role !== 'ADMIN') {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }

      if (isProtectedLaundry && payload.role !== 'LAUNDRY') {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }
    }

    return NextResponse.next()
  }

  export const config = {
    matcher: ['/admin/:path*', '/laundry/:path*'],
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd jest src/__tests__/middleware.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/middleware.ts src/__tests__/middleware.test.ts
  git commit -m "config: configure middleware to allow public dispatch routes"
  ```

---

### Task 3: Public Dispatch UI Page

**Files:**
- Create: `src/app/laundry/dispatch/page.tsx`
- Create: `src/__tests__/dispatch-ui.test.tsx`

- [ ] **Step 1: Write the failing test**
  Create `src/__tests__/dispatch-ui.test.tsx` to assert that the Dispatch UI renders correctly.
  ```typescript
  import { render, screen } from '@testing-library/react'
  import DispatchPage from '../app/laundry/dispatch/page'

  describe('Public Dispatch UI Page', () => {
    it('should render headers and preparation and ticket lists', () => {
      render(<DispatchPage />)
      expect(screen.getByText(/Chuẩn bị & Bàn giao nhanh đồ vải/i)).toBeInTheDocument()
      expect(screen.getByText(/Tổng hợp cần chuẩn bị/i)).toBeInTheDocument()
      expect(screen.getByText(/Danh sách phiếu chờ giao/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx.cmd jest src/__tests__/dispatch-ui.test.tsx`
  Expected: FAIL (Cannot find module)

- [ ] **Step 3: Write minimal implementation**
  Create `src/app/laundry/dispatch/page.tsx`:
  ```typescript
  'use client'

  import { useState, useEffect } from 'react'

  interface LinenType {
    id: string
    name: string
    unit: string
  }

  interface TicketItem {
    id: string
    quantity: number
    linenType: LinenType
  }

  interface Ticket {
    id: string
    ward: { name: string }
    createdAt: string
    items: TicketItem[]
  }

  export default function DispatchPage() {
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
      fetchTickets()
    }, [])

    const fetchTickets = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/dispatch/tickets')
        if (res.ok) {
          setTickets(await res.json())
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const showFeedback = (type: 'success' | 'error', text: string) => {
      setMessage({ type, text })
      setTimeout(() => setMessage(null), 4000)
    }

    const handleDeliver = async (ticketId: string) => {
      try {
        const res = await fetch('/api/dispatch/tickets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId }),
        })
        if (res.ok) {
          showFeedback('success', 'Đã xác nhận giao hàng thành công!')
          fetchTickets()
        } else {
          showFeedback('error', 'Lỗi xác nhận bàn giao')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      }
    }

    // Aggregate preparation totals
    const preparationSummary: Record<string, { quantity: number; unit: string }> = {}
    tickets.forEach((t) => {
      t.items.forEach((item) => {
        const key = item.linenType.name
        if (!preparationSummary[key]) {
          preparationSummary[key] = { quantity: 0, unit: item.linenType.unit }
        }
        preparationSummary[key].quantity += item.quantity
      })
    })

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
                B
              </div>
              <div>
                <span className="font-extrabold text-lg text-[#0066b2] tracking-tight">BECAMEX HOSPITALS</span>
                <span className="text-xxs block text-slate-500 font-bold tracking-widest uppercase -mt-1">Laundry Dispatch</span>
              </div>
            </div>
            <div className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">
              Chế độ vận hành nhanh
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1 flex flex-col space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Chuẩn bị & Bàn giao nhanh đồ vải</h1>
            <p className="text-sm text-slate-500 mt-1">Dành cho bộ phận nhà giặt điều phối giao nhận hằng ngày không cần đăng nhập.</p>
          </div>

          {message && (
            <div className={`p-4 rounded-xl border font-bold text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin" />
              <p className="text-slate-400 text-sm mt-3 font-semibold">Đang tải phiếu yêu cầu...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Preparation List - Left column (30% / 1 share) */}
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5 h-fit">
                <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
                  Tổng hợp cần chuẩn bị
                </h2>

                {Object.keys(preparationSummary).length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Không có đồ vải nào cần soạn.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(preparationSummary).map(([name, data]) => (
                      <div key={name} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-sm font-semibold text-slate-700">{name}</span>
                        <span className="text-sm font-extrabold text-[#0066b2] bg-blue-50/50 border border-blue-100 px-3 py-1 rounded-lg">
                          {data.quantity} {data.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending Tickets - Right column (70% / 2 shares) */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
                <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  Danh sách phiếu chờ giao
                </h2>

                {tickets.length === 0 ? (
                  <p className="text-sm text-slate-400 py-12 text-center">Tất cả các khoa phòng đã bàn giao xong.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tickets.map((t) => (
                      <div key={t.id} className="bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 p-4 rounded-2xl flex flex-col justify-between transition-all">
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="font-extrabold text-sm text-[#0066b2] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/40">
                              {t.ward?.name}
                            </span>
                            <span className="font-mono text-xxs font-bold text-slate-400">
                              #{t.id.split('-')[0].toUpperCase()}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100 text-xs py-1 border-t border-b border-slate-100">
                            {t.items.map((item) => (
                              <div key={item.id} className="flex justify-between py-2">
                                <span className="text-slate-600 font-medium">{item.linenType.name}</span>
                                <span className="font-bold text-slate-800">{item.quantity} {item.linenType.unit}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeliver(t.id)}
                          className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold text-sm py-2 rounded-xl transition-all cursor-pointer mt-4"
                        >
                          Xác nhận Đã giao
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx.cmd jest src/__tests__/dispatch-ui.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add src/app/laundry/dispatch/page.tsx src/__tests__/dispatch-ui.test.tsx
  git commit -m "feat: add public dispatch UI page"
  ```

---

### Task 4: Laundry Operations Dashboard Redesign

**Files:**
- Modify: `src/app/laundry/page.tsx`

- [ ] **Step 1: Apply Becamex Light Theme and Split-Screen layout**
  Update `src/app/laundry/page.tsx` with light backgrounds, becamex theme styling, and split screen layouts for each tab.
  ```typescript
  'use client'

  import { useState, useEffect } from 'react'
  import { useRouter } from 'next/navigation'

  interface LinenType {
    id: string
    name: string
    unit: string
  }

  interface Batch {
    id: string
    code: string
    linenTypeId: string
    linenType: LinenType
    totalQuantity: number
    remainingQuantity: number
    importedAt: string
  }

  interface TicketItem {
    id: string
    quantity: number
    linenType: LinenType
  }

  interface Ticket {
    id: string
    wardId: string
    ward: { name: string }
    status: string
    createdAt: string
    items: TicketItem[]
  }

  interface Circulation {
    id: string
    batchId: string
    batch: { code: string }
    linenType: LinenType
    startUseDate: string
    originalQuantity: number
    activeQuantity: number
    discardedQuantity: number
    createdAt: string
  }

  interface ReportItem {
    id: string
    code: string
    linenType: { name: string; unit: string }
    totalQuantity: number
    remainingQuantity: number
    originalCirculationCount: number
    activeCirculationCount: number
    totalDiscarded: number
    averageLifespanDays: number
  }

  export default function LaundryDashboard() {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'delivery' | 'circulation' | 'discard' | 'report'>('delivery')

    // Lists state
    const [pendingTickets, setPendingTickets] = useState<Ticket[]>([])
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

    const [batches, setBatches] = useState<Batch[]>([])
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
    const [extractionQty, setExtractionQty] = useState<number | ''>('')
    const [startUseDate, setStartUseDate] = useState(new Date().toISOString().split('T')[0])

    const [circulations, setCirculations] = useState<Circulation[]>([])
    const [selectedCirculation, setSelectedCirculation] = useState<Circulation | null>(null)
    const [discardQty, setDiscardQty] = useState<number | ''>('')
    const [discardReason, setDiscardReason] = useState('')

    const [reports, setReports] = useState<ReportItem[]>([])
    const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null)

    // Loading & feedback
    const [loading, setLoading] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
      loadTabData()
      setSelectedTicket(null)
      setSelectedBatch(null)
      setSelectedCirculation(null)
      setSelectedReport(null)
    }, [activeTab])

    const loadTabData = () => {
      if (activeTab === 'delivery') fetchPendingTickets()
      if (activeTab === 'circulation') {
        fetchBatches()
        fetchCirculations()
      }
      if (activeTab === 'discard') fetchCirculations()
      if (activeTab === 'report') fetchReports()
    }

    const showFeedback = (type: 'success' | 'error', text: string) => {
      setMessage({ type, text })
      setTimeout(() => setMessage(null), 4000)
    }

    const fetchPendingTickets = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/laundry/tickets')
        if (res.ok) {
          const data = await res.json()
          setPendingTickets(data)
          if (data.length > 0) setSelectedTicket(data[0])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const fetchBatches = async () => {
      try {
        const res = await fetch('/api/admin/batches')
        if (res.ok) {
          const data = await res.json()
          setBatches(data)
          if (data.length > 0) setSelectedBatch(data[0])
        }
      } catch (err) {
        console.error(err)
      }
    }

    const fetchCirculations = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/laundry/circulations')
        if (res.ok) {
          const data = await res.json()
          setCirculations(data)
          if (data.length > 0) setSelectedCirculation(data[0])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const fetchReports = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/laundry/reports')
        if (res.ok) {
          const data = await res.json()
          setReports(data)
          if (data.length > 0) setSelectedReport(data[0])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const handleDeliverTicket = async (ticketId: string) => {
      try {
        const res = await fetch('/api/laundry/tickets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId }),
        })
        if (res.ok) {
          showFeedback('success', 'Đã bàn giao đồ vải thành công!')
          fetchPendingTickets()
        } else {
          const data = await res.json()
          showFeedback('error', data.error || 'Bàn giao thất bại')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      }
    }

    const handleExtractCirculation = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedBatch || !extractionQty || !startUseDate) return

      try {
        const res = await fetch('/api/laundry/circulations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: selectedBatch.id,
            startUseDate: new Date(startUseDate).toISOString(),
            quantity: Number(extractionQty),
          }),
        })
        const data = await res.json()

        if (res.ok) {
          showFeedback('success', `Khai thác thành công ${extractionQty} đồ vải từ lô ${selectedBatch.code}!`)
          setExtractionQty('')
          fetchBatches()
          fetchCirculations()
        } else {
          showFeedback('error', data.error || 'Khai thác thất bại')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      }
    }

    const handleDiscardCirculation = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedCirculation || !discardQty) return

      try {
        const res = await fetch('/api/laundry/discards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linenCirculationId: selectedCirculation.id,
            quantity: Number(discardQty),
            reason: discardReason.trim(),
          }),
        })
        const data = await res.json()

        if (res.ok) {
          showFeedback('success', `Đã báo hỏng ${discardQty} đồ vải thành công!`)
          setDiscardQty('')
          setDiscardReason('')
          fetchCirculations()
        } else {
          showFeedback('error', data.error || 'Báo hỏng thất bại')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      }
    }

    const handleLogout = async () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        setLoggingOut(true)
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST' })
          if (res.ok) {
            router.push('/login')
          }
        } catch (err) {
          console.error('Logout error:', err)
        } finally {
          setLoggingOut(false)
        }
      }
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
                L
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-[#0066b2]">BECAMEX HOSPITALS</span>
                <span className="text-xxs block text-slate-500 font-bold tracking-widest -mt-1 uppercase">Linen Operations</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-bold text-slate-800">Nguyễn Minh Tiến</span>
                <span className="text-xxs text-slate-400 font-semibold uppercase">Bộ phận Giặt là</span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-3.5 py-1.5 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {/* Tab & Main Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-blue-50 text-[#0066b2] rounded flex items-center justify-center font-bold">🩺</div>
            <h1 className="text-xl font-extrabold text-slate-900">Nghiệp vụ Hộ lý - Đồ vải</h1>
          </div>

          {/* Capsule navigation tabs */}
          <div className="flex flex-wrap gap-1 bg-slate-200/50 p-1 rounded-xl border border-slate-200 max-w-4xl">
            {[
              { id: 'delivery', name: 'Bàn giao đồ vải' },
              { id: 'circulation', name: 'Khai thác đồ vải' },
              { id: 'discard', name: 'Báo hỏng / Thanh lý' },
              { id: 'report', name: 'Báo cáo tuổi thọ' },
            ].map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#1e293b] text-white shadow'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                  }`}
                >
                  {tab.name}
                </button>
              )
            })}
          </div>

          {/* Feedback banner */}
          {message && (
            <div className={`p-4 rounded-xl border font-semibold text-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          {/* Main Tab Render Grid (Split Screen Layouts) */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0066b2] rounded-full animate-spin" />
              <p className="text-slate-400 text-xs mt-3 font-medium">Đang tải...</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm min-h-[500px]">
              {/* Delivery View */}
              {activeTab === 'delivery' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left list: 30% */}
                  <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phiếu chờ giao</h3>
                    {pendingTickets.length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">Không có phiếu yêu cầu nào.</p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-auto">
                        {pendingTickets.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTicket(t)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              selectedTicket?.id === t.id
                                ? 'bg-blue-50/50 border-[#0066b2]/30'
                                : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <h4 className="font-bold text-sm text-slate-800">{t.ward?.name}</h4>
                            <div className="flex justify-between text-xxs text-slate-500 font-semibold mt-1">
                              <span>#{t.id.split('-')[0].toUpperCase()}</span>
                              <span>{new Date(t.createdAt).toLocaleTimeString('vi-VN')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right panel: 70% */}
                  <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                    {selectedTicket ? (
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                          <h3 className="font-extrabold text-base text-slate-900">{selectedTicket.ward?.name}</h3>
                          <span className="font-mono text-xs font-semibold text-slate-400">#{selectedTicket.id.split('-')[0].toUpperCase()}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {selectedTicket.items.map((item) => (
                            <div key={item.id} className="flex justify-between py-3 text-sm font-semibold">
                              <span className="text-slate-600">{item.linenType.name}</span>
                              <span className="text-slate-800">{item.quantity} {item.linenType.unit}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleDeliverTicket(selectedTicket.id)}
                          className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-blue-500/10"
                        >
                          Xác nhận Bàn giao (Giao đủ)
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một phiếu yêu cầu bên trái.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Extraction View */}
              {activeTab === 'circulation' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left list: 30% */}
                  <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lô gốc nhập kho</h3>
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {batches.filter((b) => b.remainingQuantity > 0).length === 0 ? (
                        <p className="text-sm text-slate-400 py-6 text-center">Không có lô hàng trống.</p>
                      ) : (
                        batches
                          .filter((b) => b.remainingQuantity > 0)
                          .map((batch) => (
                            <div
                              key={batch.id}
                              onClick={() => setSelectedBatch(batch)}
                              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                                selectedBatch?.id === batch.id
                                  ? 'bg-blue-50/50 border-[#0066b2]/30'
                                  : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-sm text-slate-800">{batch.code}</h4>
                                <span className="text-xxs font-extrabold text-[#0066b2] bg-blue-50 px-2 py-0.5 rounded border border-blue-100/30">
                                  Còn: {batch.remainingQuantity}
                                </span>
                              </div>
                              <p className="text-xxs text-slate-500 font-semibold">{batch.linenType?.name}</p>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Right panel: 70% */}
                  <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                    {selectedBatch ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Extract form */}
                        <form onSubmit={handleExtractCirculation} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                          <h3 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-2">Khai thác Lô {selectedBatch.code}</h3>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1 font-semibold">Số lượng đưa vào dùng</label>
                            <input
                              type="number"
                              min="1"
                              max={selectedBatch.remainingQuantity}
                              value={extractionQty}
                              onChange={(e) => setExtractionQty(e.target.value !== '' ? Number(e.target.value) : '')}
                              placeholder={`Tối đa ${selectedBatch.remainingQuantity}`}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1 font-semibold">Ngày bắt đầu sử dụng</label>
                            <input
                              type="date"
                              value={startUseDate}
                              onChange={(e) => setStartUseDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                              required
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full bg-[#0066b2] hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                          >
                            Đóng dấu bàn giao lưu thông
                          </button>
                        </form>

                        {/* Extraction history for this batch */}
                        <div className="space-y-3">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đợt đã giao lưu thông</h3>
                          <div className="space-y-2 max-h-[250px] overflow-auto">
                            {circulations.filter((c) => c.batchId === selectedBatch.id).length === 0 ? (
                              <p className="text-xxs text-slate-400 py-4 text-center">Chưa có đợt khai thác nào.</p>
                            ) : (
                              circulations
                                .filter((c) => c.batchId === selectedBatch.id)
                                .map((c) => (
                                  <div key={c.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center text-xs">
                                    <div>
                                      <span className="font-bold text-slate-700">{c.activeQuantity} / {c.originalQuantity} {c.linenType?.unit}</span>
                                      <p className="text-xxs text-slate-400 font-semibold mt-0.5">Ngày: {new Date(c.startUseDate).toLocaleDateString('vi-VN')}</p>
                                    </div>
                                  </div>
                                ))
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một lô nhập gốc bên trái.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Discard View */}
              {activeTab === 'discard' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left list: 30% */}
                  <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đợt đang lưu thông</h3>
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {circulations.filter((c) => c.activeQuantity > 0).length === 0 ? (
                        <p className="text-sm text-slate-400 py-6 text-center">Không có đồ vải lưu thông.</p>
                      ) : (
                        circulations
                          .filter((c) => c.activeQuantity > 0)
                          .map((c) => (
                            <div
                              key={c.id}
                              onClick={() => setSelectedCirculation(c)}
                              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                                selectedCirculation?.id === c.id
                                  ? 'bg-rose-50/30 border-rose-400/30'
                                  : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-sm text-slate-800">Lô: {c.batch?.code}</h4>
                                <span className="text-xxs font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100/30">
                                  Dùng: {c.activeQuantity}
                                </span>
                              </div>
                              <p className="text-xxs text-slate-500 font-semibold">{c.linenType?.name}</p>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Right panel: 70% */}
                  <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6">
                    {selectedCirculation ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Discard form */}
                        <form onSubmit={handleDiscardCirculation} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                          <h3 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            Báo hỏng đợt Lô {selectedCirculation.batch?.code}
                          </h3>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1 font-semibold">Số lượng báo hỏng</label>
                            <input
                              type="number"
                              min="1"
                              max={selectedCirculation.activeQuantity}
                              value={discardQty}
                              onChange={(e) => setDiscardQty(e.target.value !== '' ? Number(e.target.value) : '')}
                              placeholder={`Tối đa ${selectedCirculation.activeQuantity}`}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1 font-semibold">Lý do thanh lý</label>
                            <textarea
                              value={discardReason}
                              onChange={(e) => setDiscardReason(e.target.value)}
                              placeholder="Nhập lý do hỏng..."
                              rows={3}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-rose-500 transition-all resize-none"
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
                          >
                            Xác nhận Thanh lý
                      </button>
                        </form>

                        {/* Summary details */}
                        <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center text-xs space-y-2">
                          <h4 className="font-bold text-slate-700">Thông tin đợt lưu thông:</h4>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Mã đợt dùng:</span>
                            <span className="font-mono text-slate-800 font-bold">{selectedCirculation.id.split('-')[0].toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Loại đồ vải:</span>
                            <span className="text-slate-800 font-semibold">{selectedCirculation.linenType?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Bắt đầu dùng:</span>
                            <span className="text-slate-800 font-medium">{new Date(selectedCirculation.startUseDate).toLocaleDateString('vi-VN')}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200/50 pt-2 font-semibold text-slate-700">
                            <span>Đang hoạt động:</span>
                            <span>{selectedCirculation.activeQuantity} {selectedCirculation.linenType?.unit}</span>
                          </div>
                          <div className="flex justify-between text-rose-600 font-semibold">
                            <span>Đã thanh lý:</span>
                            <span>{selectedCirculation.discardedQuantity} {selectedCirculation.linenType?.unit}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một đợt đang lưu thông bên trái.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Analytics Report View */}
              {activeTab === 'report' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left list: 30% */}
                  <div className="lg:col-span-1 border-r border-slate-100 pr-0 lg:pr-6 space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Chọn lô thống kê</h3>
                    <div className="space-y-2 max-h-[400px] overflow-auto">
                      {reports.length === 0 ? (
                        <p className="text-sm text-slate-400 py-6 text-center">Chưa có dữ liệu.</p>
                      ) : (
                        reports.map((r) => (
                          <div
                            key={r.id}
                            onClick={() => setSelectedReport(r)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                              selectedReport?.id === r.id
                                ? 'bg-blue-50/50 border-[#0066b2]/30'
                                : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <h4 className="font-bold text-sm text-slate-800">{r.code}</h4>
                            <p className="text-xxs text-slate-500 font-semibold mt-1">{r.linenType.name}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right panel: 70% */}
                  <div className="lg:col-span-2 space-y-5 pl-0 lg:pl-6 flex flex-col justify-center">
                    {selectedReport ? (
                      <div className="space-y-6">
                        <div className="border-b border-slate-100 pb-3">
                          <h3 className="font-extrabold text-base text-slate-900">Thống kê chi tiết hao mòn Lô {selectedReport.code}</h3>
                          <span className="text-xxs text-slate-400 font-semibold">{selectedReport.linenType.name}</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Tổng nhập kho</span>
                            <p className="text-lg font-extrabold text-slate-800 mt-1">{selectedReport.totalQuantity} {selectedReport.linenType.unit}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Đang sử dụng</span>
                            <p className="text-lg font-extrabold text-teal-600 mt-1">{selectedReport.activeCirculationCount} {selectedReport.linenType.unit}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                            <span className="text-xxs text-slate-400 font-bold uppercase tracking-wider">Đã báo hỏng</span>
                            <p className="text-lg font-extrabold text-rose-600 mt-1">{selectedReport.totalDiscarded} {selectedReport.linenType.unit}</p>
                          </div>
                        </div>

                        <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div>
                            <h4 className="font-extrabold text-sm text-slate-800">Tuổi thọ trung bình của lô</h4>
                            <p className="text-xxs text-slate-400 font-semibold mt-0.5">Thời gian sử dụng thực tế trước khi rách/hỏng.</p>
                          </div>
                          <div className="bg-white px-5 py-2.5 rounded-xl border border-blue-100 shadow-sm text-center">
                            {selectedReport.totalDiscarded > 0 ? (
                              <span className="text-lg font-extrabold text-[#0066b2]">
                                {selectedReport.averageLifespanDays.toFixed(1)} ngày
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">Chưa có dữ liệu hao mòn</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 text-sm">Vui lòng chọn một lô thống kê bên trái.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white mt-auto">
          <p>© {new Date().getFullYear()} Hospital Linen Management & Distribution System. All rights reserved.</p>
        </footer>
      </div>
    )
  }
  ```

- [ ] **Step 2: Run all tests to make sure no breaks**
  Run: `npm.cmd run test`
  Expected: PASS

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add src/app/laundry/page.tsx
  git commit -m "style: redesign laundry dashboard with becamex light theme and split-screen layouts"
  ```

---

### Task 5: Admin Dashboards & Login/Request Pages Redesign

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/batches/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/request/order/page.tsx`

- [ ] **Step 1: Redesign Admin Layout**
  Modify `src/app/admin/layout.tsx` to match the light theme becamex branding and capsule tabs.
  ```typescript
  'use client'

  import Link from 'next/link'
  import { usePathname, useRouter } from 'next/navigation'
  import { useState } from 'react'

  export default function AdminLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const pathname = usePathname()
    const router = useRouter()
    const [loggingOut, setLoggingOut] = useState(false)

    const handleLogout = async () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        setLoggingOut(true)
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST' })
          if (res.ok) {
            router.push('/login')
          }
        } catch (err) {
          console.error('Logout error:', err)
        } finally {
          setLoggingOut(false)
        }
      }
    }

    const navItems = [
      { name: 'Đồ vải & Khoa phòng', href: '/admin' },
      { name: 'Lô nhập hàng', href: '/admin/batches' },
    ]

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white border-b border-slate-200/80 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl">
                  A
                </div>
                <div>
                  <span className="font-extrabold text-xl tracking-tight text-[#0066b2]">BECAMEX HOSPITALS</span>
                  <span className="text-xxs block text-slate-500 font-bold tracking-widest -mt-1 uppercase">Admin Portal</span>
                </div>
              </div>

              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 ${
                        isActive
                          ? 'bg-[#1e293b] text-white shadow'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                      }`}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-bold text-slate-800">Quản trị viên</span>
                <span className="text-xxs text-slate-500 font-semibold uppercase">Phòng Quản trị</span>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-3.5 py-1.5 border border-slate-200 hover:border-red-500/40 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          {/* Mobile Navigation */}
          <div className="md:hidden flex gap-2 mb-6 bg-slate-200/60 p-1 rounded-xl border border-slate-200">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 text-center py-2 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#1e293b] text-white shadow'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/20'
                  }`}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>

          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 bg-white mt-auto">
          <p>© {new Date().getFullYear()} Hospital Linen Management & Distribution System. All rights reserved.</p>
        </footer>
      </div>
    )
  }
  ```

- [ ] **Step 2: Redesign Admin Main Page**
  Modify `src/app/admin/page.tsx` with light backgrounds, slate inputs, becamex cards, becamex blue confirm buttons.
  ```typescript
  'use client'

  import { useState, useEffect } from 'react'

  interface LinenType {
    id: string
    name: string
    unit: string
    createdAt: string
  }

  interface Ward {
    id: string
    name: string
    qrToken: string
    createdAt: string
  }

  export default function AdminDashboard() {
    const [linenTypes, setLinenTypes] = useState<LinenType[]>([])
    const [wards, setWards] = useState<Ward[]>([])

    // Form states
    const [ltName, setLtName] = useState('')
    const [ltUnit, setLtUnit] = useState('Cái')
    const [wardName, setWardName] = useState('')

    // Loading & feedback states
    const [loadingTypes, setLoadingTypes] = useState(true)
    const [loadingWards, setLoadingWards] = useState(true)
    const [submittingType, setSubmittingType] = useState(false)
    const [submittingWard, setSubmittingWard] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // Fetch initial data
    useEffect(() => {
      fetchLinenTypes()
      fetchWards()
    }, [])

    const fetchLinenTypes = async () => {
      setLoadingTypes(true)
      try {
        const res = await fetch('/api/admin/linen-types')
        if (res.ok) {
          const data = await res.json()
          setLinenTypes(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingTypes(false)
      }
    }

    const fetchWards = async () => {
      setLoadingWards(true)
      try {
        const res = await fetch('/api/admin/wards')
        if (res.ok) {
          const data = await res.json()
          setWards(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingWards(false)
      }
    }

    const showFeedback = (type: 'success' | 'error', text: string) => {
      setMessage({ type, text })
      setTimeout(() => setMessage(null), 4000)
    }

    const handleCreateLinenType = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!ltName.trim() || !ltUnit.trim()) return

      setSubmittingType(true)
      try {
        const res = await fetch('/api/admin/linen-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: ltName.trim(), unit: ltUnit.trim() }),
        })
        const data = await res.json()

        if (res.ok) {
          setLtName('')
          showFeedback('success', `Đã tạo thành công loại vải: ${data.name}`)
          fetchLinenTypes()
        } else {
          showFeedback('error', data.error || 'Lỗi khi tạo loại vải mới')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối hệ thống')
      } finally {
        setSubmittingType(false)
      }
    }

    const handleCreateWard = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!wardName.trim()) return

      setSubmittingWard(true)
      try {
        const res = await fetch('/api/admin/wards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: wardName.trim() }),
        })
        const data = await res.json()

        if (res.ok) {
          setWardName('')
          showFeedback('success', `Đã tạo thành công khoa phòng: ${data.name}`)
          fetchWards()
        } else {
          showFeedback('error', data.error || 'Lỗi khi tạo khoa phòng mới')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối hệ thống')
      } finally {
        setSubmittingWard(false)
      }
    }

    const handleCopyQRLink = (ward: Ward) => {
      const origin = window.location.origin
      const qrLink = `${origin}/request/order?wardId=${ward.id}&token=${ward.qrToken}`
      
      navigator.clipboard.writeText(qrLink).then(
        () => {
          setCopiedId(ward.id)
          setTimeout(() => setCopiedId(null), 2000)
        },
        () => {
          alert('Không thể sao chép liên kết vào clipboard. Vui lòng sao chép thủ công.')
        }
      )
    }

    return (
      <div className="space-y-8 animate-fade-in text-slate-800">
        {/* Title section */}
        <div>
          <h1 className="text-2xl font-extrabold text-[#0066b2]">
            Danh mục Đồ vải & Khoa phòng
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Quản lý định nghĩa danh mục các loại đồ vải của bệnh viện và cấu hình mã QR truy cập cho từng khoa phòng.
          </p>
        </div>

        {/* Global feedback message */}
        {message && (
          <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {message.text}
          </div>
        )}

        {/* Grid panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Panel 1: Linen Types */}
          <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
              Quản lý Loại đồ vải
            </h2>

            {/* Form */}
            <form onSubmit={handleCreateLinenType} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
              <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm loại đồ vải mới</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tên loại đồ vải</label>
                  <input
                    type="text"
                    value={ltName}
                    onChange={(e) => setLtName(e.target.value)}
                    placeholder="Ga trải giường, vỏ gối..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Đơn vị</label>
                  <select
                    value={ltUnit}
                    onChange={(e) => setLtUnit(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                  >
                    <option value="Cái">Cái</option>
                    <option value="Bộ">Bộ</option>
                    <option value="Chiếc">Chiếc</option>
                    <option value="Đôi">Đôi</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={submittingType}
                className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
              >
                Thêm loại đồ vải
              </button>
            </form>

            {/* List */}
            <div className="flex-1 overflow-auto max-h-[350px]">
              {loadingTypes ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
              ) : linenTypes.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có loại đồ vải.</div>
              ) : (
                <div className="overflow-hidden border border-slate-200/80 rounded-xl">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 font-bold text-slate-500">Tên loại đồ vải</th>
                        <th className="px-4 py-3 font-bold text-slate-500 w-24">Đơn vị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {linenTypes.map((lt) => (
                        <tr key={lt.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-700">{lt.name}</td>
                          <td className="px-4 py-3">
                            <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-slate-100 text-slate-600 border border-slate-200/40">
                              {lt.unit}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Panel 2: Wards */}
          <section className="bg-white border border-slate-200/85 rounded-2xl p-6 flex flex-col shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
              Quản lý Khoa phòng & QR Link
            </h2>

            {/* Form */}
            <form onSubmit={handleCreateWard} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
              <h3 className="text-xxs font-extrabold text-slate-500 uppercase tracking-wider">Thêm khoa phòng mới</h3>
              <div>
                <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tên khoa phòng</label>
                <input
                  type="text"
                  value={wardName}
                  onChange={(e) => setWardName(e.target.value)}
                  placeholder="Ví dụ: Khoa Cấp Cứu, Khoa Nhi..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submittingWard}
                className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
              >
                Tạo khoa phòng
              </button>
            </form>

            {/* List */}
            <div className="flex-1 overflow-auto max-h-[350px]">
              {loadingWards ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">Đang tải...</div>
              ) : wards.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">Chưa có khoa phòng.</div>
              ) : (
                <div className="space-y-2">
                  {wards.map((ward) => (
                    <div
                      key={ward.id}
                      className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all duration-150"
                    >
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">{ward.name}</h4>
                        <p className="text-xxs text-slate-400 font-semibold mt-0.5">
                          Ngày tạo: {new Date(ward.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopyQRLink(ward)}
                        className={`px-3 py-1.5 rounded-lg text-xxs font-extrabold border transition-all duration-150 flex items-center gap-1 cursor-pointer ${
                          copiedId === ward.id
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-[#0066b2]/50 hover:text-[#0066b2]'
                        }`}
                      >
                        {copiedId === ward.id ? 'Đã sao chép!' : 'Sao chép link QR'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Redesign Admin Batches Page**
  Modify `src/app/admin/batches/page.tsx` with light theme card panels, stock meters, Becamex styles.
  ```typescript
  'use client'

  import { useState, useEffect } from 'react'

  interface LinenType {
    id: string
    name: string
    unit: string
  }

  interface Batch {
    id: string
    code: string
    linenTypeId: string
    linenType: LinenType
    totalQuantity: number
    remainingQuantity: number
    importedAt: string
    createdAt: string
  }

  export default function AdminBatches() {
    const [batches, setBatches] = useState<Batch[]>([])
    const [linenTypes, setLinenTypes] = useState<LinenType[]>([])

    // Form states
    const [code, setCode] = useState('')
    const [linenTypeId, setLinenTypeId] = useState('')
    const [totalQuantity, setTotalQuantity] = useState<number | ''>('')
    const [importedAt, setImportedAt] = useState(new Date().toISOString().split('T')[0])

    // Loading & feedback states
    const [loadingBatches, setLoadingBatches] = useState(true)
    const [loadingTypes, setLoadingTypes] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
      fetchBatches()
      fetchLinenTypes()
    }, [])

    const fetchBatches = async () => {
      setLoadingBatches(true)
      try {
        const res = await fetch('/api/admin/batches')
        if (res.ok) {
          setBatches(await res.json())
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingBatches(false)
      }
    }

    const fetchLinenTypes = async () => {
      setLoadingTypes(true)
      try {
        const res = await fetch('/api/admin/linen-types')
        if (res.ok) {
          const data = await res.json()
          setLinenTypes(data)
          if (data.length > 0) {
            setLinenTypeId(data[0].id)
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingTypes(false)
      }
    }

    const showFeedback = (type: 'success' | 'error', text: string) => {
      setMessage({ type, text })
      setTimeout(() => setMessage(null), 4000)
    }

    const handleCreateBatch = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!code.trim() || !linenTypeId || !totalQuantity || !importedAt) {
        showFeedback('error', 'Vui lòng điền đầy đủ thông tin')
        return
      }

      setSubmitting(true)
      try {
        const res = await fetch('/api/admin/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim(),
            linenTypeId,
            totalQuantity: Number(totalQuantity),
            importedAt: new Date(importedAt).toISOString(),
          }),
        })
        const data = await res.json()

        if (res.ok) {
          setCode('')
          setTotalQuantity('')
          showFeedback('success', `Đã nhập thành công lô hàng: ${data.code}`)
          fetchBatches()
        } else {
          showFeedback('error', data.error || 'Lỗi khi nhập lô hàng')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmitting(false)
      }
    }

    const getStatusBadge = (batch: Batch) => {
      if (batch.remainingQuantity === batch.totalQuantity) {
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-slate-100 text-slate-600 border border-slate-200/50">
            Chưa khai thác
          </span>
        )
      }
      if (batch.remainingQuantity === 0) {
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-red-50 text-red-600 border border-red-100/30">
            Khai thác hết
          </span>
        )
      }
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-blue-50 text-[#0066b2] border border-blue-100/30">
          Đang khai thác
        </span>
      )
    }

    return (
      <div className="space-y-8 animate-fade-in text-slate-800">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-extrabold text-[#0066b2]">
            Quản lý Lô nhập hàng
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Khai báo các lô hàng dệt may y tế mới nhập kho trước khi đưa vào lưu thông.
          </p>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left form */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm sticky top-24">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
                Nhập lô hàng mới
              </h2>

              <form onSubmit={handleCreateBatch} className="space-y-4">
                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Mã lô nhập</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="BATCH-2026-001"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Loại đồ vải</label>
                  {loadingTypes ? (
                    <div className="text-xs text-slate-400 font-semibold py-2">Đang tải...</div>
                  ) : (
                    <select
                      value={linenTypeId}
                      onChange={(e) => setLinenTypeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                      required
                    >
                      {linenTypes.map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.name} ({lt.unit})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Tổng số lượng</label>
                  <input
                    type="number"
                    min="1"
                    value={totalQuantity}
                    onChange={(e) => setTotalQuantity(e.target.value !== '' ? Number(e.target.value) : '')}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-semibold">Ngày nhập kho</label>
                  <input
                    type="date"
                    value={importedAt}
                    onChange={(e) => setImportedAt(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2] transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs transition-all cursor-pointer"
                >
                  Nhập kho lô hàng
                </button>
              </form>
            </div>
          </div>

          {/* Right list */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm flex flex-col h-full">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
                Lịch sử các lô hàng nhập
              </h2>

              {loadingBatches ? (
                <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
              ) : batches.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có lô hàng.</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 font-bold text-slate-500">Mã lô</th>
                        <th className="px-4 py-3 font-bold text-slate-500">Loại vải</th>
                        <th className="px-4 py-3 font-bold text-slate-500 text-center">Trữ lượng (Còn/Tổng)</th>
                        <th className="px-4 py-3 font-bold text-slate-500">Ngày nhập</th>
                        <th className="px-4 py-3 font-bold text-slate-500">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {batches.map((batch) => {
                        const percentRemaining = (batch.remainingQuantity / batch.totalQuantity) * 100
                        return (
                          <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 font-bold text-slate-700">{batch.code}</td>
                            <td className="px-4 py-4 text-slate-600">{batch.linenType?.name}</td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex flex-col items-center gap-1 w-28 mx-auto">
                                <span className="font-bold text-slate-700 text-xxs">
                                  {batch.remainingQuantity} / {batch.totalQuantity}
                                </span>
                                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                  <div
                                    style={{ width: `${percentRemaining}%` }}
                                    className={`h-full rounded-full transition-all ${
                                      percentRemaining === 100
                                        ? 'bg-emerald-500'
                                        : percentRemaining === 0
                                        ? 'bg-slate-300'
                                        : 'bg-[#0066b2]'
                                    }`}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-500">
                              {new Date(batch.importedAt).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-4 py-4">{getStatusBadge(batch)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4: Redesign Login Page**
  Modify `src/app/login/page.tsx` with light Becamex layout styling.
  ```typescript
  'use client'

  import { useState } from 'react'
  import { useRouter } from 'next/navigation'

  export default function LoginPage() {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!username.trim() || !password.trim()) return

      setSubmitting(true)
      setErrorMsg(null)

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            password: password.trim(),
          }),
        })
        const data = await res.json()

        if (res.ok) {
          if (data.role === 'ADMIN') {
            router.push('/admin')
          } else if (data.role === 'LAUNDRY') {
            router.push('/laundry')
          } else {
            setErrorMsg('Tài khoản không được phân quyền.')
          }
        } else {
          setErrorMsg(data.error || 'Đăng nhập thất bại.')
        }
      } catch (err) {
        setErrorMsg('Lỗi kết nối máy chủ.')
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center px-4 relative font-sans">
        <div className="w-full max-w-sm bg-white border border-slate-200/80 rounded-2xl p-7 shadow-lg space-y-5">
          <div className="text-center">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#0066b2] to-blue-400 flex items-center justify-center font-bold text-white text-xl mx-auto mb-2 shadow-sm">
              H
            </div>
            <h1 className="text-lg font-extrabold text-[#0066b2]">Đăng nhập Hệ thống</h1>
            <p className="text-xxs text-slate-400 font-bold tracking-wider uppercase mt-0.5">Becamex Hospital Linen</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold flex items-center gap-1.5">
              <span>⚠️ {errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username-input" className="block text-xxs font-bold text-slate-500 mb-1.5 uppercase">
                Tên đăng nhập
              </label>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tài khoản..."
                className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all font-semibold"
                required
              />
            </div>

            <div>
              <label htmlFor="password-input" className="block text-xxs font-bold text-slate-500 mb-1.5 uppercase">
                Mật khẩu
              </label>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0066b2] focus:ring-1 focus:ring-[#0066b2] transition-all font-semibold"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer mt-1 shadow-sm shadow-blue-500/10"
            >
              {submitting ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 5: Redesign Ward Request Page**
  Modify `src/app/request/order/page.tsx` with light Becamex styling.
  ```typescript
  // In src/app/request/order/page.tsx
  // Redesign container, forms, and touch controls to use:
  // - Background: slate-50/50
  // - Main Card: bg-white border border-slate-100 shadow-lg
  // - Brand/Logo color: text-[#0066b2] bg-blue-50/50 border border-blue-100
  // - Buttons: bg-blue-600 hover:bg-blue-700
  ```
  *(Update file content to apply these Becamex light theme tokens directly to the layout structure)*

- [ ] **Step 6: Run all tests to make sure no breaks**
  Run: `npm.cmd run test`
  Expected: PASS

- [ ] **Step 7: Commit**
  Run:
  ```bash
  git add src/app/admin/layout.tsx src/app/admin/page.tsx src/app/admin/batches/page.tsx src/app/login/page.tsx src/app/request/order/page.tsx
  git commit -m "style: redesign admin, login, and request views to Becamex light theme"
  ```

---

### Task 6: Final Verification & Production Build

- [ ] **Step 1: Run complete test suite**
  Run: `npm.cmd run test`
  Expected: PASS (all 32+ tests passing successfully)

- [ ] **Step 2: Run production compilation**
  Run: `npm.cmd run build`
  Expected: SUCCESS (compiled successfully without any static page generation errors)

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git commit --allow-empty -m "build: verify final compilation and test suite passes successfully"
  ```
