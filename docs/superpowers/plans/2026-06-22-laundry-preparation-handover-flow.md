# Quy trình Chuẩn bị và Bàn giao Đồ vải Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai luồng cập nhật trạng thái mới cho phiếu yêu cầu đồ vải gồm 3 bước: PENDING -> PREPARED -> DELIVERED. Tích hợp hiển thị ngày tháng hiện tại tĩnh và tích hợp Sub-tabs ("Chờ chuẩn bị" và "Chuẩn bị bàn giao") trong tab "Bàn giao" hiện tại của Nghiệp vụ nhà giặt chính, giữ nguyên cấu trúc 4 tab chính.

**Architecture:**
* Thêm trạng thái `PREPARED` vào enum `TicketStatus` trong database (Đã xong).
* Cập nhật API `POST /api/request/order` tự động tính `deliveryDate` dựa trên mốc 12:00 trưa giờ Việt Nam (Đã xong).
* Cập nhật API GET `/api/laundry/tickets` trả về cả phiếu `PENDING` và `PREPARED` của ngày làm việc hôm nay trở về trước (Cần làm).
* Cập nhật API PUT `/api/laundry/tickets` hỗ trợ chuyển đổi trạng thái tuần tự: `PENDING` -> `PREPARED` -> `DELIVERED` (Đã xong).
* Tích hợp 2 sub-tabs ("Chờ chuẩn bị" và "Chuẩn bị bàn giao") bên trong tab Bàn giao của trang `/laundry`, hỗ trợ chuyển tiếp trạng thái và giữ tab hiện tại khi nhấn hoàn thành (Cần làm).

**Tech Stack:** Next.js (TypeScript, React), TailwindCSS, Prisma (PostgreSQL), Jest (Kiểm thử).

---

### Task 1: Update Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [x] **Step 1: Cập nhật file schema.prisma**
- [x] **Step 2: Thực hiện đẩy schema lên Database**
- [x] **Step 3: Chạy lại tests để chắc chắn database đồng bộ**
- [x] **Step 4: Commit thay đổi schema**

---

### Task 2: Update API Endpoint `POST /api/request/order`

**Files:**
- Modify: `src/app/api/request/order/route.ts`
- Modify: `src/__tests__/request.test.ts`

- [x] **Step 1: Viết test case xác thực logic gán ngày tự động**
- [x] **Step 2: Run test và xác nhận lỗi thất bại**
- [x] **Step 3: Cập nhật logic trong API**
- [x] **Step 4: Chạy test và xác nhận vượt qua**
- [x] **Step 5: Commit thay đổi**

---

### Task 3: Update Laundry Tickets API `/api/laundry/tickets` GET method

**Files:**
- Modify: `src/app/api/laundry/tickets/route.ts`
- Test: `src/__tests__/laundry.test.ts`

- [ ] **Step 1: Cập nhật phương thức GET trong route.ts**
  Chỉnh sửa `src/app/api/laundry/tickets/route.ts` để lọc phiếu có trạng thái `PENDING` hoặc `PREPARED` và có `deliveryDate` nhỏ hơn hoặc bằng cuối ngày hôm nay (bao gồm các phiếu quá hạn chưa hoàn thành).
  ```typescript
  // Trong src/app/api/laundry/tickets/route.ts GET method
  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ['PENDING', 'PREPARED'] },
      deliveryDate: {
        lte: endOfToday,
      },
    },
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
  ```

- [ ] **Step 2: Run test và xác nhận bộ test hiện tại vẫn PASS**
  Run: `cmd /c npx jest src/__tests__/laundry.test.ts`
  Expected: PASS

- [ ] **Step 3: Bổ dung kiểm thử lọc theo trạng thái trong laundry.test.ts**
  Mở `src/__tests__/laundry.test.ts`, thêm khẳng định trong test case `Tickets API` để kiểm tra danh sách GET có chứa cả phiếu `PREPARED` sau khi cập nhật trạng thái:
  ```typescript
  // Trong src/__tests__/laundry.test.ts: sau khi putTicket lần 1 chuyển sang PREPARED
  const getReq2 = createRequest('GET', null, laundryToken)
  const getRes2 = await getTickets(getReq2)
  const ticketsAfterPrep = await getRes2.json()
  expect(ticketsAfterPrep.some((t: any) => t.id === ticket.id && t.status === 'PREPARED')).toBe(true)
  ```

- [ ] **Step 4: Chạy test kiểm thử API toàn diện**
  Run: `cmd /c npx jest src/__tests__/laundry.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit thay đổi**
  ```bash
  git add src/app/api/laundry/tickets/route.ts src/__tests__/laundry.test.ts
  git commit -m "api: update laundry tickets endpoint to support prepared status filtering by date lte endOfToday"
  ```

---

### Task 4: Update Dispatch Tickets API `/api/dispatch/tickets`

**Files:**
- Modify: `src/app/api/dispatch/tickets/route.ts`
- Modify: `src/__tests__/dispatch-api.test.ts`

- [x] **Step 1: Cập nhật test case**
- [x] **Step 2: Run test và xác nhận lỗi**
- [x] **Step 3: Triển khai logic API**
- [x] **Step 4: Chạy test và xác nhận vượt qua**
- [x] **Step 5: Commit thay đổi**

---

### Task 5: Modify Laundry Dashboard UI `/laundry` (Option A: Sub-tabs inside Bàn giao tab)

**Files:**
- Modify: `src/app/laundry/page.tsx`
- Test: `src/__tests__/login-ui.test.tsx`

- [ ] **Step 1: Thêm state sub-tab và hiển thị ngày làm việc tĩnh**
  Mở `src/app/laundry/page.tsx`, thêm state `deliverySubTab` bên trong component `LaundryDashboard`:
  ```typescript
  const [deliverySubTab, setDeliverySubTab] = useState<'prepare' | 'ready'>('prepare')
  ```
  Trong phần hiển thị của tab `delivery` (khi `activeTab === 'delivery'`), thêm tiêu đề chứa ngày làm việc hiện tại và giao diện chọn sub-tab:
  ```tsx
  {activeTab === 'delivery' && (
    <div className="space-y-6">
      {/* Date and Sub-tabs Selection */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold px-2.5 py-1 bg-blue-50 text-[#0066b2] rounded-lg border border-blue-100/50">
            Ngày làm việc: {new Date().toLocaleDateString('vi-VN')}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDeliverySubTab('prepare')
              const firstPending = pendingTickets.find(t => t.status === 'PENDING')
              setSelectedTicket(firstPending || null)
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xxs font-bold transition-all cursor-pointer ${
              deliverySubTab === 'prepare'
                ? 'bg-[#1e293b] text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            1. Chờ chuẩn bị ({pendingTickets.filter(t => t.status === 'PENDING').length})
          </button>
          <button
            onClick={() => {
              setDeliverySubTab('ready')
              const firstPrepared = pendingTickets.find(t => t.status === 'PREPARED')
              setSelectedTicket(firstPrepared || null)
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xxs font-bold transition-all cursor-pointer ${
              deliverySubTab === 'ready'
                ? 'bg-[#1e293b] text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            2. Chuẩn bị bàn giao ({pendingTickets.filter(t => t.status === 'PREPARED').length})
          </button>
        </div>
      </div>
      
      {/* Grid Danh sách & Chi tiết */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        ...
      </div>
    </div>
  )}
  ```

- [ ] **Step 2: Cập nhật lọc danh sách phiếu bên trái theo Sub-tab hiện tại**
  Trong cột danh sách bên trái (`lg:col-span-1`), thay đổi tiêu đề và lọc danh sách hiển thị dựa trên `deliverySubTab`:
  * Tiêu đề: `deliverySubTab === 'prepare' ? 'Phiếu chờ chuẩn bị' : 'Phiếu sẵn sàng bàn giao'`
  * Danh sách lọc:
    ```typescript
    const filteredTickets = pendingTickets.filter(t => 
      deliverySubTab === 'prepare' ? t.status === 'PENDING' : t.status === 'PREPARED'
    )
    ```
  * Hiển thị danh sách phiếu từ `filteredTickets`, mỗi thẻ khi click sẽ cập nhật `selectedTicket`.

- [ ] **Step 3: Cập nhật nút hành động ở bảng chi tiết bên phải**
  Ở bảng chi tiết bên phải (`lg:col-span-2`), nút hành động ở dưới cùng sẽ phụ thuộc vào trạng thái của phiếu hiện tại (`selectedTicket`):
  * Nếu `selectedTicket.status === 'PENDING'`:
    * Nhãn nút: `"Đã chuẩn bị xong"`
    * Khi click, gọi hàm `handleDeliverTicket(selectedTicket.id)`
  * Nếu `selectedTicket.status === 'PREPARED'`:
    * Nhãn nút: `"Xác nhận Bàn giao (Giao đủ)"`
    * Khi click, gọi hàm `handleDeliverTicket(selectedTicket.id)`

- [ ] **Step 4: Cập nhật logic load lại dữ liệu sau khi hoàn thành**
  Chỉnh sửa hàm `fetchPendingTickets` trong `src/app/laundry/page.tsx` để tự động chọn đúng phiếu tiếp theo trong danh sách sau khi dữ liệu được tải lại:
  ```typescript
  const fetchPendingTickets = async (targetSubTab?: 'prepare' | 'ready') => {
    setLoading(true)
    try {
      const res = await fetch('/api/laundry/tickets')
      if (res.ok) {
        const data = await res.json()
        setPendingTickets(data)
        
        // Tự động chọn phiếu tiếp theo trong subtab hiện tại
        const activeSub = targetSubTab || deliverySubTab
        const filtered = data.filter((t: any) => 
          activeSub === 'prepare' ? t.status === 'PENDING' : t.status === 'PREPARED'
        )
        if (filtered.length > 0) {
          setSelectedTicket(filtered[0])
        } else {
          setSelectedTicket(null)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  ```
  Đồng thời chỉnh sửa hàm `handleDeliverTicket` để gọi `fetchPendingTickets(deliverySubTab)` sau khi cập nhật thành công (giữ nguyên sub-tab hiện tại và hiển thị thông báo thành công thích hợp).
  ```typescript
  // Logic feedback trong handleDeliverTicket
  if (res.ok) {
    const updated = await res.json()
    if (updated.status === 'PREPARED') {
      showFeedback('success', 'Đã chuẩn bị xong!')
    } else if (updated.status === 'DELIVERED') {
      showFeedback('success', 'Đã bàn giao đồ vải thành công!')
    }
    fetchPendingTickets(deliverySubTab)
  }
  ```

- [ ] **Step 5: Chạy các bài kiểm thử tự động của UI**
  Run: `cmd /c npx jest src/__tests__/login-ui.test.tsx`
  Expected: PASS

- [ ] **Step 6: Commit các thay đổi giao diện**
  ```bash
  git add src/app/laundry/page.tsx
  git commit -m "fe: implement sub-tabs for ticket preparation and ready lists inside laundry delivery tab"
  ```

---

### Task 6: Modify Quick Dispatch UI `/laundry/dispatch`

**Files:**
- Modify: `src/app/laundry/dispatch/page.tsx`

- [x] **Step 1: Hiển thị ngày tĩnh và Chia đôi bố cục**
- [x] **Step 2: Chạy kiểm thử**
- [x] **Step 3: Commit thay đổi**

---

### Task 7: Modify Admin/Supervisor Dashboard `/admin/dispatch`

**Files:**
- Modify: `src/app/admin/dispatch/page.tsx`

- [x] **Step 2: Chạy bộ kiểm thử tự động toàn diện**
- [x] **Step 3: Commit thay đổi**
