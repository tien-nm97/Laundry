# Quản lý kho và Tái chế Đồ vải Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi trang quản lý lô hàng nhập cũ thành trang "Quản lý kho" hợp nhất hiển thị tổng lượng tồn kho gốc, lượng lưu hành, lượng báo hỏng; đồng thời tích hợp thêm chức năng nhập lô mới và báo hỏng/tái chế drap cũ thành vỏ gối dưới dạng modal, cho phép vai trò Giám sát (Supervisor) xem và thao tác.

**Architecture:** Bổ sung API `GET /api/admin/inventory` để tổng hợp số liệu kho và `POST /api/admin/inventory/recycle` thực hiện transaction báo hỏng/tái chế trong cơ sở dữ liệu. Cập nhật Next.js middleware (proxy.ts) và layout để cho phép vai trò SUPERVISOR truy cập, đồng thời xây dựng giao diện hợp nhất có tích hợp realtime sync tại `/admin/inventory/page.tsx`.

**Tech Stack:** Next.js (App Router), React, Prisma, Tailwind CSS, Jest

---

### Task 1: Thiết lập API GET và POST mới ở Backend

**Files:**
- Create: `src/app/api/admin/inventory/route.ts`
- Create: `src/app/api/admin/inventory/recycle/route.ts`

- [ ] **Step 1: Tạo route API GET `/api/admin/inventory`**
  Tạo tệp `src/app/api/admin/inventory/route.ts` thực hiện việc lấy thông tin tổng hợp kho và các lô hàng hoạt động:
  
  ```typescript
  import { prisma } from '@/lib/db'
  import { verifyPermission } from '@/lib/jwt'
  import { NextResponse } from 'next/server'

  export const dynamic = 'force-dynamic'

  export async function GET(request: Request) {
    const auth = await verifyPermission(request, 'admin:view')
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
      // 1. Get all linen types with their batches and circulations
      const linenTypes = await prisma.linenType.findMany({
        include: {
          batches: true,
          circulations: true,
        },
        orderBy: { name: 'asc' },
      })

      // 2. Map and aggregate counts
      const inventory = linenTypes.map((lt) => {
        const originalStock = lt.batches.reduce((sum, b) => sum + b.remainingQuantity, 0)
        const inCirculation = lt.circulations.reduce((sum, c) => sum + c.activeQuantity, 0)
        const discarded = lt.circulations.reduce((sum, c) => sum + c.discardedQuantity, 0)
        
        return {
          linenTypeId: lt.id,
          name: lt.name,
          unit: lt.unit,
          originalStock,
          inCirculation,
          discarded,
          totalAccumulated: originalStock + inCirculation + discarded,
        }
      })

      // 3. Get all batches for history table
      const batches = await prisma.batch.findMany({
        include: {
          linenType: true,
        },
        orderBy: { importedAt: 'desc' },
      })

      // 4. Get active circulations (activeQuantity > 0) for dropdown in damage/recycle flow
      const activeCirculations = await prisma.linenCirculation.findMany({
        where: {
          activeQuantity: { gt: 0 }
        },
        include: {
          linenType: true,
          batch: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({
        inventory,
        batches,
        activeCirculations,
      })
    } catch (error: any) {
      console.error('GET inventory error:', error)
      return NextResponse.json({ error: 'Lỗi khi tải dữ liệu kho' }, { status: 500 })
    }
  }
  ```

- [ ] **Step 2: Tạo route API POST `/api/admin/inventory/recycle`**
  Tạo tệp `src/app/api/admin/inventory/recycle/route.ts` xử lý báo hỏng và tái chế Drap thành Vỏ gối:
  
  ```typescript
  import { prisma } from '@/lib/db'
  import { verifyToken } from '@/lib/jwt'
  import { NextResponse } from 'next/server'

  export async function POST(request: Request) {
    // Verify authentication and role (ADMIN or SUPERVISOR)
    const cookieHeader = request.headers.get('cookie') || ''
    let token: string | undefined = undefined
    const cookieList = cookieHeader.split(';')
    for (const cookie of cookieList) {
      const [name, val] = cookie.trim().split('=')
      if (name === 'token') {
        token = val
        break
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Phiên làm việc hết hạn hoặc không hợp lệ' }, { status: 401 })
    }

    const hasPermission = payload.role === 'ADMIN' || payload.role === 'SUPERVISOR' || (payload.permissions || []).includes('admin:batch')
    if (!hasPermission) {
      return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
    }

    try {
      const body = await request.json()
      const { linenCirculationId, discardQuantity, action, recycledQuantity } = body

      if (!linenCirculationId || !discardQuantity || !action) {
        return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
      }

      if (Number(discardQuantity) <= 0) {
        return NextResponse.json({ error: 'Số lượng báo hỏng phải lớn hơn 0' }, { status: 400 })
      }

      if (action === 'RECYCLE' && (recycledQuantity === undefined || Number(recycledQuantity) <= 0)) {
        return NextResponse.json({ error: 'Số lượng vỏ gối thu hồi tái chế không hợp lệ' }, { status: 400 })
      }

      const result = await prisma.$transaction(async (tx) => {
        // 1. Fetch source circulation
        const circulation = await tx.linenCirculation.findUnique({
          where: { id: linenCirculationId },
          include: { linenType: true }
        })

        if (!circulation) {
          throw new Error('Lô đồ vải lưu thông không tồn tại')
        }

        if (circulation.activeQuantity < Number(discardQuantity)) {
          throw new Error(`Số lượng báo hỏng vượt quá lượng lưu hành còn lại (${circulation.activeQuantity})`)
        }

        const isDrap = circulation.linenType.name.toLowerCase().includes('drap') ||
                      circulation.linenType.name.toLowerCase().includes('ga trải') ||
                      circulation.linenType.name.toLowerCase().includes('ga giường')

        if (action === 'RECYCLE' && !isDrap) {
          throw new Error('Chỉ có thể tái chế từ các loại Drap/Ga trải giường')
        }

        // 2. Decrement activeQuantity and increment discardedQuantity in circulation
        const updatedCirculation = await tx.linenCirculation.update({
          where: { id: linenCirculationId },
          data: {
            activeQuantity: { decrement: Number(discardQuantity) },
            discardedQuantity: { increment: Number(discardQuantity) },
          }
        })

        // 3. Create LinenDiscardLog
        const reason = action === 'RECYCLE' 
          ? `Tái chế thành Vỏ gối (Thu hồi: ${recycledQuantity} cái)`
          : 'Báo hỏng thông thường'

        const discardLog = await tx.linenDiscardLog.create({
          data: {
            linenCirculationId,
            quantity: Number(discardQuantity),
            reason,
          }
        })

        // 4. Create target batch for Pillowcases (Vỏ gối) if recycling
        let newBatch = null
        if (action === 'RECYCLE') {
          // Find or create "Vỏ gối" LinenType
          let targetLinenType = await tx.linenType.findFirst({
            where: { name: { equals: 'Vỏ gối', mode: 'insensitive' } }
          })

          if (!targetLinenType) {
            targetLinenType = await tx.linenType.create({
              data: {
                name: 'Vỏ gối',
                unit: 'Cái'
              }
            })
          }

          // Generate autogenerated batch code
          const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          const batchCode = `RECYCLE-${todayStr}`

          newBatch = await tx.batch.create({
            data: {
              code: batchCode,
              linenTypeId: targetLinenType.id,
              totalQuantity: Number(recycledQuantity),
              remainingQuantity: Number(recycledQuantity),
              importedAt: new Date(),
            }
          })
        }

        return { updatedCirculation, discardLog, newBatch }
      })

      return NextResponse.json(result, { status: 201 })
    } catch (error: any) {
      console.error('POST inventory recycle error:', error)
      return NextResponse.json({ error: error.message || 'Lỗi hệ thống khi báo hỏng/tái chế' }, { status: 400 })
    }
  }
  ```

- [ ] **Step 3: Commit API Backend**
  ```bash
  git add src/app/api/admin/inventory/route.ts src/app/api/admin/inventory/recycle/route.ts
  git commit -m "feat: implement GET inventory data aggregation and POST recycling APIs"
  ```

---

### Task 2: Viết Unit Tests cho API Inventory mới

**Files:**
- Create: `src/__tests__/inventory.test.ts`

- [ ] **Step 1: Tạo tệp Unit Tests `src/__tests__/inventory.test.ts`**
  Viết các test case kiểm nghiệm hành vi của các API vừa tạo:
  
  ```typescript
  /**
   * @jest-environment node
   */
  import { GET } from '../app/api/admin/inventory/route'
  import { POST } from '../app/api/admin/inventory/recycle/route'
  import { prisma } from '../lib/db'
  import { signToken } from '../lib/jwt'

  describe('Inventory & Recycling Admin APIs', () => {
    let adminToken: string
    let supervisorToken: string
    let laundryToken: string
    let testWard: any
    let testLinenTypeDrap: any
    let testBatch: any
    let testCirculation: any

    beforeAll(async () => {
      adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
      supervisorToken = await signToken({ userId: '2', username: 'supervisor', role: 'SUPERVISOR' })
      laundryToken = await signToken({ userId: '3', username: 'laundry', role: 'LAUNDRY' })

      // Create test LinenType Drap
      testLinenTypeDrap = await prisma.linenType.create({
        data: { name: 'TEST-DRAP-1', unit: 'Tấm' }
      })

      testBatch = await prisma.batch.create({
        data: {
          code: 'TEST-BATCH-INV',
          linenTypeId: testLinenTypeDrap.id,
          totalQuantity: 100,
          remainingQuantity: 50,
          importedAt: new Date()
        }
      })

      testCirculation = await prisma.linenCirculation.create({
        data: {
          batchId: testBatch.id,
          linenTypeId: testLinenTypeDrap.id,
          startUseDate: new Date(),
          originalQuantity: 50,
          activeQuantity: 50,
        }
      })
    })

    afterAll(async () => {
      await prisma.linenDiscardLog.deleteMany({
        where: { circulation: { linenTypeId: testLinenTypeDrap.id } }
      })
      await prisma.linenCirculation.deleteMany({
        where: { linenTypeId: testLinenTypeDrap.id }
      })
      await prisma.batch.deleteMany({
        where: { code: { startsWith: 'RECYCLE-' } }
      })
      await prisma.batch.deleteMany({
        where: { id: testBatch.id }
      })
      await prisma.linenType.deleteMany({
        where: { id: testLinenTypeDrap.id }
      })
    })

    const createRequest = (method: string, cookieToken?: string, body?: any) => {
      const headers: Record<string, string> = {}
      if (cookieToken) {
        headers['cookie'] = `token=${cookieToken}`
      }
      if (body) {
        headers['Content-Type'] = 'application/json'
      }
      return new Request('http://localhost/api/admin/inventory', {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      }) as any
    }

    describe('GET /api/admin/inventory', () => {
      it('should allow Admin and Supervisor to fetch aggregated inventory', async () => {
        const reqAdmin = createRequest('GET', adminToken)
        const resAdmin = await GET(reqAdmin)
        expect(resAdmin.status).toBe(200)

        const dataAdmin = await resAdmin.json()
        expect(dataAdmin.inventory).toBeDefined()
        expect(dataAdmin.batches).toBeDefined()
        expect(dataAdmin.activeCirculations).toBeDefined()

        // Test with Supervisor token
        const reqSuper = createRequest('GET', supervisorToken)
        const resSuper = await GET(reqSuper)
        expect(resSuper.status).toBe(200)
      })

      it('should reject Laundry role with 403', async () => {
        const req = createRequest('GET', laundryToken)
        const res = await GET(req)
        expect(res.status).toBe(403)
      })
    })

    describe('POST /api/admin/inventory/recycle', () => {
      it('should perform normal discard successfully', async () => {
        const body = {
          linenCirculationId: testCirculation.id,
          discardQuantity: 5,
          action: 'DISCARD'
        }
        const req = createRequest('POST', adminToken, body)
        const res = await POST(req)
        expect(res.status).toBe(201)

        const data = await res.json()
        expect(data.updatedCirculation.activeQuantity).toBe(45)
        expect(data.updatedCirculation.discardedQuantity).toBe(5)
        expect(data.discardLog.reason).toBe('Báo hỏng thông thường')
      })

      it('should perform Drap to Pillowcase recycling successfully', async () => {
        const body = {
          linenCirculationId: testCirculation.id,
          discardQuantity: 10,
          action: 'RECYCLE',
          recycledQuantity: 20
        }
        const req = createRequest('POST', supervisorToken, body)
        const res = await POST(req)
        expect(res.status).toBe(201)

        const data = await res.json()
        expect(data.updatedCirculation.activeQuantity).toBe(35)
        expect(data.updatedCirculation.discardedQuantity).toBe(15)
        expect(data.discardLog.reason).toBe('Tái chế thành Vỏ gối (Thu hồi: 20 cái)')
        expect(data.newBatch).toBeDefined()
        expect(data.newBatch.totalQuantity).toBe(20)
        expect(data.newBatch.remainingQuantity).toBe(20)
      })

      it('should reject if discard quantity exceeds active quantity', async () => {
        const body = {
          linenCirculationId: testCirculation.id,
          discardQuantity: 100,
          action: 'DISCARD'
        }
        const req = createRequest('POST', adminToken, body)
        const res = await POST(req)
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toContain('Số lượng báo hỏng vượt quá lượng lưu hành còn lại')
      })
    })
  })
  ```

- [ ] **Step 2: Chạy unit tests để xác nhận mọi thứ đã pass**
  Run: `npx.cmd jest src/__tests__/inventory.test.ts`
  Expected: PASS

- [ ] **Step 3: Commit các test cases**
  ```bash
  git add src/__tests__/inventory.test.ts
  git commit -m "test: add test suite for inventory and recycling backend API"
  ```

---

### Task 3: Cập nhật Định Tuyến và Phân Quyền (Proxy & Layout Navigation)

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Cập nhật Middleware định tuyến `/admin/inventory` cho Supervisor**
  Mở tệp [proxy.ts](file:///d:/OneDrive/desktop/Laundry/src/proxy.ts) và thay thế đoạn code xác thực vai trò Supervisor (khoảng dòng 34-42):
  
  *Mục tiêu thay đổi:*
  ```typescript
  // Target content in src/proxy.ts:
      if (isProtectedAdmin) {
        const isDispatchRoute = pathname.startsWith('/admin/dispatch')
        if (payload.role === 'ADMIN') {
          // Allowed
        } else if (payload.role === 'SUPERVISOR' && isDispatchRoute) {
          // Allowed
        } else {
          const loginUrl = new URL('/login', request.url)
          return NextResponse.redirect(loginUrl)
        }
      }
  ```
  
  *Replacement content:*
  ```typescript
      if (isProtectedAdmin) {
        const isDispatchRoute = pathname.startsWith('/admin/dispatch')
        const isInventoryRoute = pathname.startsWith('/admin/inventory')
        if (payload.role === 'ADMIN') {
          // Allowed
        } else if (payload.role === 'SUPERVISOR' && (isDispatchRoute || isInventoryRoute)) {
          // Allowed
        } else {
          const loginUrl = new URL('/login', request.url)
          return NextResponse.redirect(loginUrl)
        }
      }
  ```

- [ ] **Step 2: Chạy bộ kiểm thử Proxy để xác thực thay đổi không phá vỡ route cũ**
  Run: `npx.cmd jest src/__tests__/proxy.test.ts`
  Expected: PASS

- [ ] **Step 3: Đổi tên tab và cấu hình phân quyền trong Menu Sidebar**
  Mở tệp [layout.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/layout.tsx) và thay thế mục menu `"Lô nhập hàng"` (khoảng dòng 81-90):
  
  *Target content:*
  ```typescript
      { 
        name: 'Lô nhập hàng', 
        href: '/admin/batches', 
        roles: ['ADMIN'],
        icon: (active: boolean) => (
          <svg className={`w-4 h-4 mr-2.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-[#0066b2]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )
      },
  ```
  
  *Replacement content:*
  ```typescript
      { 
        name: 'Quản lý kho', 
        href: '/admin/inventory', 
        roles: ['ADMIN', 'SUPERVISOR'],
        icon: (active: boolean) => (
          <svg className={`w-4 h-4 mr-2.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-[#0066b2]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )
      },
  ```

- [ ] **Step 4: Chạy tất cả kiểm thử liên quan đến định tuyến và layouts**
  Run: `npx.cmd jest src/__tests__/dispatch-ui.test.tsx` (hoặc các bài kiểm thử liên quan)
  Expected: PASS

- [ ] **Step 5: Commit các thay đổi Proxy & Navigation**
  ```bash
  git add src/proxy.ts src/app/admin/layout.tsx
  git commit -m "feat: adjust proxy middleware to grant supervisor access to inventory and change tab name"
  ```

---

### Task 4: Xây dựng Giao diện Trang Quản lý kho Mới

**Files:**
- Delete: `src/app/admin/batches/page.tsx`
- Create: `src/app/admin/inventory/page.tsx`

- [ ] **Step 1: Xóa tệp cũ `batches/page.tsx`**
  ```bash
  rm src/app/admin/batches/page.tsx
  ```

- [ ] **Step 2: Tạo tệp trang Quản lý kho mới `/admin/inventory/page.tsx`**
  Tạo tệp `src/app/admin/inventory/page.tsx` với đầy đủ KPI, bảng tồn kho, lịch sử và 2 modals: Nhập lô hàng mới & Báo hỏng/Tái chế:
  
  ```tsx
  'use client'

  import { useState, useEffect } from 'react'
  import { useRealtimeSync } from '@/lib/useRealtimeSync'

  interface LinenType {
    id: string
    name: string
    unit: string
  }

  interface AggregatedInventory {
    linenTypeId: string
    name: string
    unit: string
    originalStock: number
    inCirculation: number
    discarded: number
    totalAccumulated: number
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

  interface ActiveCirculation {
    id: string
    batchId: string
    batch: { code: string }
    linenTypeId: string
    linenType: LinenType
    activeQuantity: number
    startUseDate: string
  }

  export default function AdminInventory() {
    const [inventory, setInventory] = useState<AggregatedInventory[]>([])
    const [batches, setBatches] = useState<Batch[]>([])
    const [activeCirculations, setActiveCirculations] = useState<ActiveCirculation[]>([])
    const [linenTypes, setLinenTypes] = useState<LinenType[]>([])

    // Loadings
    const [loadingData, setLoadingData] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    // Modals Control
    const [showImportModal, setShowImportModal] = useState(false)
    const [showRecycleModal, setShowRecycleModal] = useState(false)

    // Form 1: Import Batch State
    const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0])
    const [selectedLinenTypeId, setSelectedLinenTypeId] = useState('')
    const [importQty, setImportQty] = useState<number | ''>('')
    const [importItems, setImportItems] = useState<{ linenTypeId: string; name: string; unit: string; totalQuantity: number }[]>([])

    // Form 2: Discard & Recycle State
    const [selectedCirculationId, setSelectedCirculationId] = useState('')
    const [discardQty, setDiscardQty] = useState<number | ''>('')
    const [recycleAction, setRecycleAction] = useState<'DISCARD' | 'RECYCLE'>('DISCARD')
    const [recycledPillowQty, setRecycledPillowQty] = useState<number | ''>('')

    const generatedBatchCode = `BATCH-${importDate.replace(/-/g, '')}`

    useEffect(() => {
      fetchInventoryData()
      fetchLinenTypes()
    }, [])

    useRealtimeSync(
      ['Batch', 'LinenCirculation', 'LinenDiscardLog', 'LinenType'],
      () => {
        fetchInventoryData()
      },
      'admin-inventory-sync'
    )

    const fetchInventoryData = async () => {
      try {
        const res = await fetch('/api/admin/inventory')
        if (res.ok) {
          const data = await res.json()
          setInventory(data.inventory || [])
          setBatches(data.batches || [])
          setActiveCirculations(data.activeCirculations || [])
        }
      } catch (err) {
        console.error('Error fetching inventory aggregated:', err)
      } finally {
        setLoadingData(false)
      }
    }

    const fetchLinenTypes = async () => {
      try {
        const res = await fetch('/api/admin/linen-types')
        if (res.ok) {
          const data = await res.json()
          setLinenTypes(data)
          if (data.length > 0) {
            setSelectedLinenTypeId(data[0].id)
          }
        }
      } catch (err) {
        console.error(err)
      }
    }

    const showFeedback = (type: 'success' | 'error', text: string) => {
      setMessage({ type, text })
      setTimeout(() => setMessage(null), 4000)
    }

    // Modal 1: Import items helpers
    const handleAddImportItem = (e: React.MouseEvent) => {
      e.preventDefault()
      if (!selectedLinenTypeId || !importQty || Number(importQty) <= 0) {
        showFeedback('error', 'Vui lòng chọn loại đồ vải và nhập số lượng hợp lệ')
        return
      }

      const selectedType = linenTypes.find(lt => lt.id === selectedLinenTypeId)
      if (!selectedType) return

      const existingIndex = importItems.findIndex(item => item.linenTypeId === selectedLinenTypeId)
      if (existingIndex > -1) {
        const updated = [...importItems]
        updated[existingIndex].totalQuantity += Number(importQty)
        setImportItems(updated)
      } else {
        setImportItems([
          ...importItems,
          {
            linenTypeId: selectedLinenTypeId,
            name: selectedType.name,
            unit: selectedType.unit,
            totalQuantity: Number(importQty)
          }
        ])
      }
      setImportQty('')
    }

    const handleRemoveImportItem = (index: number) => {
      setImportItems(importItems.filter((_, i) => i !== index))
    }

    const handleCreateBatchSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (importItems.length === 0) {
        showFeedback('error', 'Vui lòng thêm ít nhất một loại đồ vải vào danh sách')
        return
      }

      setSubmitting(true)
      try {
        const res = await fetch('/api/admin/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: generatedBatchCode,
            importedAt: new Date(importDate).toISOString(),
            items: importItems.map(item => ({
              linenTypeId: item.linenTypeId,
              totalQuantity: item.totalQuantity
            }))
          }),
        })
        const data = await res.json()

        if (res.ok) {
          setImportItems([])
          setImportQty('')
          setShowImportModal(false)
          showFeedback('success', `Đã nhập thành công lô hàng: ${generatedBatchCode}`)
          fetchInventoryData()
        } else {
          showFeedback('error', data.error || 'Lỗi khi nhập lô hàng')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmitting(false)
      }
    }

    // Modal 2: Recycle helpers
    const selectedCirc = activeCirculations.find(c => c.id === selectedCirculationId)
    const isEligibleForRecycling = selectedCirc
      ? (selectedCirc.linenType.name.toLowerCase().includes('drap') ||
         selectedCirc.linenType.name.toLowerCase().includes('ga trải') ||
         selectedCirc.linenType.name.toLowerCase().includes('ga giường'))
      : false

    useEffect(() => {
      if (!isEligibleForRecycling) {
        setRecycleAction('DISCARD')
      }
    }, [selectedCirculationId, isEligibleForRecycling])

    const handleRecycleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedCirculationId || !discardQty || Number(discardQty) <= 0) {
        showFeedback('error', 'Vui lòng điền đầy đủ các trường bắt buộc')
        return
      }

      if (selectedCirc && selectedCirc.activeQuantity < Number(discardQty)) {
        showFeedback('error', `Số lượng vượt quá lượng lưu hành (${selectedCirc.activeQuantity})`)
        return
      }

      if (recycleAction === 'RECYCLE' && (!recycledPillowQty || Number(recycledPillowQty) <= 0)) {
        showFeedback('error', 'Vui lòng nhập số vỏ gối thu hồi thực tế')
        return
      }

      setSubmitting(true)
      try {
        const res = await fetch('/api/admin/inventory/recycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linenCirculationId: selectedCirculationId,
            discardQuantity: Number(discardQty),
            action: recycleAction,
            recycledQuantity: recycleAction === 'RECYCLE' ? Number(recycledPillowQty) : undefined
          })
        })

        const data = await res.json()
        if (res.ok) {
          showFeedback('success', recycleAction === 'RECYCLE' 
            ? 'Đã báo hỏng & chuyển sang tái chế thành công!' 
            : 'Đã báo hỏng thanh lý đồ vải thành công!')
          setSelectedCirculationId('')
          setDiscardQty('')
          setRecycledPillowQty('')
          setShowRecycleModal(false)
          fetchInventoryData()
        } else {
          showFeedback('error', data.error || 'Lỗi khi thực hiện báo hỏng/tái chế')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmitting(false)
      }
    }

    // KPI Aggregates
    const totalOriginal = inventory.reduce((sum, item) => sum + item.originalStock, 0)
    const totalCirculation = inventory.reduce((sum, item) => sum + item.inCirculation, 0)
    const totalDiscarded = inventory.reduce((sum, item) => sum + item.discarded, 0)

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0066b2]">
              Quản lý kho
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Thống kê lượng tồn kho gốc, lượng đang lưu hành và quản lý hao hụt, tái chế đồ vải.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (linenTypes.length > 0) setSelectedLinenTypeId(linenTypes[0].id)
                setShowImportModal(true)
              }}
              className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer"
            >
              ＋ Nhập lô hàng mới
            </button>
            <button
              onClick={() => setShowRecycleModal(true)}
              className="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100/60 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              ⚠ Báo hỏng & Tái chế
            </button>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            {message.text}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-50 text-[#0066b2] rounded-xl flex items-center justify-center font-bold text-lg">📦</div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Tồn kho gốc</span>
              <span className="text-xl font-black text-slate-800">{totalOriginal} cái</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-lg">🔄</div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Đang lưu hành</span>
              <span className="text-xl font-black text-slate-800">{totalCirculation} cái</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-bold text-lg">🗑️</div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Đã báo hỏng</span>
              <span className="text-xl font-black text-slate-800">{totalDiscarded} cái</span>
            </div>
          </div>
        </div>

        {/* Inventory Summary Table */}
        <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Bảng thống kê lượng tồn kho
          </h2>

          {loadingData ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
          ) : inventory.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có dữ liệu đồ vải.</div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 font-bold text-slate-500">Loại đồ vải</th>
                    <th className="px-4 py-3 font-bold text-slate-500 text-center">Đơn vị</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-center">Tồn kho gốc</th>
                    <th className="px-4 py-3 font-bold text-blue-600 text-center">Đang lưu hành</th>
                    <th className="px-4 py-3 font-bold text-rose-500 text-center">Đã báo hỏng</th>
                    <th className="px-4 py-3 font-bold text-slate-900 text-center">Tổng tích lũy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {inventory.map((item) => (
                    <tr key={item.linenTypeId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 font-bold text-slate-700">{item.name}</td>
                      <td className="px-4 py-4 text-center text-slate-500">{item.unit}</td>
                      <td className="px-4 py-4 text-center font-bold text-slate-800">{item.originalStock}</td>
                      <td className="px-4 py-4 text-center font-bold text-[#0066b2]">{item.inCirculation}</td>
                      <td className="px-4 py-4 text-center font-bold text-rose-600">{item.discarded}</td>
                      <td className="px-4 py-4 text-center font-black text-slate-900 bg-slate-50/30">{item.totalAccumulated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Batch Import History Table */}
        <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0066b2]" />
            Lịch sử các lô hàng nhập
          </h2>

          {loadingData ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Đang tải...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Chưa có lô hàng nào được nhập.</div>
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

        {/* Modal 1: Import Batch */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">Nhập lô hàng mới</h3>
                <button
                  type="button"
                  onClick={() => {
                    setImportItems([])
                    setShowImportModal(false)
                  }}
                  className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateBatchSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-bold">Mã lô (Tự động tạo)</label>
                  <input
                    type="text"
                    value={generatedBatchCode}
                    readOnly
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-bold text-slate-500 cursor-not-allowed focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-bold">Ngày nhập kho</label>
                  <input
                    type="date"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    required
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900">Chi tiết đồ vải nhập</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xxs text-slate-500 mb-1 font-bold">Loại đồ vải</label>
                      <select
                        value={selectedLinenTypeId}
                        onChange={(e) => setSelectedLinenTypeId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                      >
                        {linenTypes.map((lt) => (
                          <option key={lt.id} value={lt.id}>
                            {lt.name} ({lt.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng</label>
                      <input
                        type="number"
                        min="1"
                        value={importQty}
                        onChange={(e) => setImportQty(e.target.value !== '' ? Number(e.target.value) : '')}
                        placeholder="Số lượng"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddImportItem}
                        className="w-full h-[34px] border border-dashed border-[#0066b2] hover:bg-blue-50 text-[#0066b2] font-bold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>＋</span> Thêm dòng
                      </button>
                    </div>
                  </div>
                </div>

                {importItems.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-32 overflow-y-auto">
                    <table className="w-full text-left text-xxs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 font-bold text-slate-500">Mặt hàng</th>
                          <th className="px-3 py-2 font-bold text-slate-500 text-center">SL</th>
                          <th className="px-3 py-2 font-bold text-slate-500 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {importItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-slate-700 font-medium">{item.name}</td>
                            <td className="px-3 py-2 text-slate-600 font-bold text-center">{item.totalQuantity} {item.unit}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveImportItem(idx)}
                                className="text-red-500 hover:text-red-700 font-bold cursor-pointer px-1.5"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setImportItems([])
                      setShowImportModal(false)
                    }}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || importItems.length === 0}
                    className="px-4 py-2 bg-[#0066b2] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'Đang xử lý...' : 'Nhập kho lô hàng'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal 2: Discard & Recycle */}
        {showRecycleModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-scale-up">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">Báo hỏng & Tái chế đồ vải</h3>
                <button
                  type="button"
                  onClick={() => setShowRecycleModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRecycleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-bold">Lô đồ vải đang lưu thông</label>
                  <select
                    value={selectedCirculationId}
                    onChange={(e) => setSelectedCirculationId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    required
                  >
                    <option value="">-- Chọn lô đang lưu thông --</option>
                    {activeCirculations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.linenType.name} - Lô: {c.batch.code} (Lưu hành: {c.activeQuantity})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCirc && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 text-xxs text-slate-500 space-y-1">
                    <p>• Mặt hàng: <strong className="text-slate-700">{selectedCirc.linenType.name}</strong></p>
                    <p>• Lô gốc: <strong className="text-slate-700">{selectedCirc.batch.code}</strong></p>
                    <p>• Đang hoạt động: <strong className="text-slate-700">{selectedCirc.activeQuantity} {selectedCirc.linenType.unit}</strong></p>
                  </div>
                )}

                <div>
                  <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng báo hỏng</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedCirc ? selectedCirc.activeQuantity : undefined}
                    value={discardQty}
                    onChange={(e) => setDiscardQty(e.target.value !== '' ? Number(e.target.value) : '')}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                    placeholder="SL cần báo hỏng"
                    required
                  />
                </div>

                {selectedCirc && (
                  <div>
                    <label className="block text-xxs text-slate-500 mb-2 font-bold">Phương thức xử lý</label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="recycleAction"
                          checked={recycleAction === 'DISCARD'}
                          onChange={() => setRecycleAction('DISCARD')}
                        />
                        <span>Thanh lý / Hủy bỏ thông thường</span>
                      </label>
                      
                      {isEligibleForRecycling && (
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="recycleAction"
                            checked={recycleAction === 'RECYCLE'}
                            onChange={() => setRecycleAction('RECYCLE')}
                          />
                          <span className="text-emerald-600 font-bold">Tái chế thành Vỏ gối</span>
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {recycleAction === 'RECYCLE' && (
                  <div className="space-y-2 border-t border-slate-100 pt-3 animate-fade-in">
                    <label className="block text-xxs text-slate-500 mb-1 font-bold">Số lượng vỏ gối thu hồi thực tế</label>
                    <input
                      type="number"
                      min="1"
                      value={recycledPillowQty}
                      onChange={(e) => setRecycledPillowQty(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="SL vỏ gối nhận được từ nhà cung cấp"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0066b2]"
                      required
                    />
                    <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">
                      * Số lượng này sẽ tự động tạo một lô hàng nhập (Batch) mới cho loại đồ vải "Vỏ gối".
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowRecycleModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {submitting ? 'Đang xử lý...' : 'Xác nhận xử lý'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Khai báo lớp CSS hiệu ứng trong globals.css**
  Mở tệp [globals.css](file:///d:/OneDrive/desktop/Laundry/src/app/globals.css) để bổ sung animation scale-up và fade-in nếu cần (mặc định đã có fade-in từ bài trước, chỉ cần thêm `animate-scale-up` nếu chưa có).
  Hãy chèn ở cuối tệp:
  
  ```css
  @keyframes scaleUp {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .animate-scale-up {
    animation: scaleUp 0.15s ease-out forwards;
  }
  ```

- [ ] **Step 4: Chạy linter để kiểm định sạch sẽ giao diện mới**
  Run: `npm run lint`
  Expected: Không có lỗi ESLint ở tệp `src/app/admin/inventory/page.tsx`.

- [ ] **Step 5: Commit trang giao diện Quản lý kho**
  ```bash
  git add src/app/admin/inventory/page.tsx src/app/globals.css
  git commit -m "feat: design new unified Inventory Management dashboard page with modaled import and recycle flows"
  ```

---

### Task 5: Kiểm thử Toàn diện & Hủy bỏ các tệp không cần thiết

- [ ] **Step 1: Xóa file/endpoint cũ nếu không dùng**
  Nếu file batches/page.tsx chưa được xóa ở Task 4 Step 1:
  Run: `git rm src/app/admin/batches/page.tsx` (hoặc kiểm tra lại trạng thái để bảo đảm đã được xóa hoàn toàn khỏi git)

- [ ] **Step 2: Chạy toàn bộ các bộ test tự động của hệ thống**
  Run: `npx.cmd jest`
  Expected: Tất cả các test suites (laundry.test.ts, request.test.ts, inventory.test.ts, proxy.test.ts, auth.test.ts) đều PASS.

- [ ] **Step 3: Commit hoàn thành**
  ```bash
  git commit -m "cleanup: remove old batches dashboard view and complete feature transition"
  ```
