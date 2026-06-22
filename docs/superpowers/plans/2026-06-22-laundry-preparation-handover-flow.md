# Quy trình Chuẩn bị và Bàn giao Đồ vải Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai luồng cập nhật trạng thái mới cho phiếu yêu cầu đồ vải gồm 3 bước: PENDING (Danh sách cần chuẩn bị) -> PREPARED (Danh sách sẵn sàng) -> DELIVERED (Đã bàn giao), đồng thời đơn giản hóa nghiệp vụ nhà giặt chỉ gồm 2 tab riêng biệt, tích hợp hiển thị ngày tháng hiện tại tĩnh mà không cho phép thay đổi.

**Architecture:**
* Thêm trạng thái `PREPARED` vào enum `TicketStatus` trong database.
* Cập nhật API `POST /api/request/order` tự động gán `deliveryDate` là ngày hôm sau nếu tạo phiếu sau 12:00 trưa, ngược lại gán ngày hôm nay.
* Cập nhật API GET `/api/laundry/tickets` và `/api/dispatch/tickets` hỗ trợ lọc theo ngày.
* Cập nhật API PUT `/api/laundry/tickets` và `/api/dispatch/tickets` hỗ trợ chuyển đổi trạng thái tiếp theo (`PENDING` -> `PREPARED` -> `DELIVERED`).
* Đơn giản hóa giao diện `/laundry` (rút về 2 tab chính) và `/laundry/dispatch` (chia đôi bố cục 2 danh sách), cập nhật dashboard giám sát `/admin/dispatch`.

**Tech Stack:** Next.js (TypeScript, React), TailwindCSS, Prisma (PostgreSQL), Jest (Kiểm thử).

---

### Task 1: Update Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Cập nhật file schema.prisma**
  Thêm `PREPARED` vào enum `TicketStatus` tại dòng 110:
  ```prisma
  enum TicketStatus {
    PENDING
    PREPARED
    DELIVERED
  }
  ```

- [ ] **Step 2: Thực hiện đẩy schema lên Database**
  Run: `cmd /c npx prisma db push`
  Expected: Database updated successfully.

- [ ] **Step 3: Chạy lại tests để chắc chắn database đồng bộ**
  Run: `cmd /c npx jest --runInBand`
  Expected: PASS

- [ ] **Step 4: Commit thay đổi schema**
  ```bash
  git add prisma/schema.prisma
  git commit -m "db: add PREPARED status to TicketStatus enum"
  ```

---

### Task 2: Update API Endpoint `POST /api/request/order`

**Files:**
- Modify: `src/app/api/request/order/route.ts`
- Modify: `src/__tests__/request.test.ts`

- [ ] **Step 1: Viết test case xác thực logic gán ngày tự động**
  Mở `src/__tests__/request.test.ts` và thêm test case kiểm tra ngày bàn giao mục tiêu:
  ```typescript
  it('should set deliveryDate to tomorrow if created after 12:00 PM', async () => {
    // Logic test case mô phỏng tạo lúc 14:00
  })
  ```

- [ ] **Step 2: Run test và xác nhận lỗi thất bại**
  Run: `cmd /c npx jest src/__tests__/request.test.ts -t "should set deliveryDate"`
  Expected: FAIL

- [ ] **Step 3: Cập nhật logic trong API**
  Chỉnh sửa `src/app/api/request/order/route.ts` tại vị trí tạo ticket:
  ```typescript
  const now = new Date()
  const deliveryDate = new Date(now)
  if (now.getHours() >= 12) {
    deliveryDate.setDate(now.getDate() + 1)
  }
  deliveryDate.setHours(0, 0, 0, 0)

  // Trong Prisma create
  deliveryDate: deliveryDate,
  ```

- [ ] **Step 4: Chạy test và xác nhận vượt qua**
  Run: `cmd /c npx jest src/__tests__/request.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit thay đổi**
  ```bash
  git add src/app/api/request/order/route.ts src/__tests__/request.test.ts
  git commit -m "api: update ticket creation to calculate deliveryDate based on afternoon cutoff"
  ```

---

### Task 3: Update Laundry Tickets API `/api/laundry/tickets`

**Files:**
- Modify: `src/app/api/laundry/tickets/route.ts`
- Modify: `src/__tests__/laundry.test.ts`

- [ ] **Step 1: Cập nhật test case kiểm thử luồng PENDING -> PREPARED -> DELIVERED**
  Mở `src/__tests__/laundry.test.ts`, cập nhật test case tại mục `Tickets API` để kiểm thử bước chuyển trạng thái trung gian `PREPARED`:
  ```typescript
  // 1. Cập nhật phiếu từ PENDING sang PREPARED
  const putReq1 = createRequest('PUT', { ticketId: ticket.id }, laundryToken)
  const putRes1 = await putTicket(putReq1)
  expect(putRes1.status).toBe(200)
  const updated1 = await putRes1.json()
  expect(updated1.status).toBe('PREPARED')

  // 2. Cập nhật phiếu từ PREPARED sang DELIVERED
  const putReq2 = createRequest('PUT', { ticketId: ticket.id }, laundryToken)
  const putRes2 = await putTicket(putReq2)
  expect(putRes2.status).toBe(200)
  const updated2 = await putRes2.json()
  expect(updated2.status).toBe('DELIVERED')
  ```

- [ ] **Step 2: Run test và xác nhận lỗi thất bại**
  Run: `cmd /c npx jest src/__tests__/laundry.test.ts`
  Expected: FAIL

- [ ] **Step 3: Triển khai logic trong API**
  Chỉnh sửa `src/app/api/laundry/tickets/route.ts`:
  * Trong `GET`:
    * Lấy tham số `date` từ query parameters. Định dạng YYYY-MM-DD. Mặc định là ngày hôm nay.
    * Lọc các phiếu có `status: { in: ['PENDING', 'PREPARED'] }` và có `deliveryDate` trong ngày được chọn.
  * Trong `PUT`:
    * Đọc phiếu hiện tại.
    * Nếu trạng thái là `PENDING`, cập nhật thành `PREPARED`.
    * Nếu trạng thái là `PREPARED`, cập nhật thành `DELIVERED` và set `deliveryDate: new Date()`.

- [ ] **Step 4: Chạy test và xác nhận vượt qua**
  Run: `cmd /c npx jest src/__tests__/laundry.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit thay đổi**
  ```bash
  git add src/app/api/laundry/tickets/route.ts src/__tests__/laundry.test.ts
  git commit -m "api: update laundry tickets endpoint for intermediate prepared status and date filter"
  ```

---

### Task 4: Update Dispatch Tickets API `/api/dispatch/tickets`

**Files:**
- Modify: `src/app/api/dispatch/tickets/route.ts`
- Modify: `src/__tests__/dispatch-api.test.ts`

- [ ] **Step 1: Cập nhật test case**
  Cập nhật `src/__tests__/dispatch-api.test.ts` để kiểm thử việc chuyển đổi qua trạng thái trung gian `PREPARED`.

- [ ] **Step 2: Run test và xác nhận lỗi**
  Run: `cmd /c npx jest src/__tests__/dispatch-api.test.ts`
  Expected: FAIL

- [ ] **Step 3: Triển khai logic API**
  Chỉnh sửa `src/app/api/dispatch/tickets/route.ts`:
  * Trong `GET`: Lọc theo ngày tương tự `laundry/tickets`.
  * Trong `PUT`: Cập nhật trạng thái tuần tự từ `PENDING` -> `PREPARED` -> `DELIVERED`.

- [ ] **Step 4: Chạy test và xác nhận vượt qua**
  Run: `cmd /c npx jest src/__tests__/dispatch-api.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit thay đổi**
  ```bash
  git add src/app/api/dispatch/tickets/route.ts src/__tests__/dispatch-api.test.ts
  git commit -m "api: update dispatch tickets endpoint to support date filter and 2-step transition"
  ```

---

### Task 5: Modify Laundry Dashboard UI `/laundry`

**Files:**
- Modify: `src/app/laundry/page.tsx`

- [ ] **Step 1: Đơn giản hóa Tabs chính và Thêm hiển thị ngày**
  Chỉnh sửa `src/app/laundry/page.tsx`:
  * Thay thế các tabs hiện tại: chỉ giữ lại 2 tab: `prepare` (Danh sách cần chuẩn bị) và `ready` (Danh sách sẵn sàng).
  * Hiển thị ngày hôm nay cố định (dạng text: `Ngày làm việc: DD/MM/YYYY`) ở góc trên.
  * Gọi API lấy danh sách ticket truyền thêm query param `date` của ngày hôm nay.

- [ ] **Step 2: Triển khai hành vi giữ nguyên tab chuẩn bị khi click xong**
  * Trong tab `prepare`, hiển thị danh sách phiếu `PENDING`. Khi bấm nút "Xong" (hoặc "Đã chuẩn bị xong"), gọi API cập nhật trạng thái phiếu. Sau khi cập nhật thành công, tải lại danh sách phiếu mà không đổi `activeTab` (màn hình vẫn ở tab `prepare`).
  * Tự động chọn phiếu tiếp theo trong danh sách làm phiếu được active (hoặc `null` nếu danh sách trống).

- [ ] **Step 3: Triển khai tab Danh sách sẵn sàng**
  * Hiển thị danh sách phiếu `PREPARED`. Khi bấm nút "Xác nhận bàn giao", gọi API cập nhật trạng thái phiếu thành `DELIVERED` và tải lại danh sách.

- [ ] **Step 4: Chạy kiểm thử UI khói**
  Run: `cmd /c npx jest src/__tests__/login-ui.test.tsx`
  Expected: PASS

- [ ] **Step 5: Commit thay đổi giao diện**
  ```bash
  git add src/app/laundry/page.tsx
  git commit -m "fe: simplify laundry dashboard to 2 tabs, add static date and stay-on-tab done action"
  ```

---

### Task 6: Modify Quick Dispatch UI `/laundry/dispatch`

**Files:**
- Modify: `src/app/laundry/dispatch/page.tsx`

- [ ] **Step 1: Hiển thị ngày tĩnh và Chia đôi bố cục**
  Chỉnh sửa `src/app/laundry/dispatch/page.tsx`:
  * Thay đổi tiêu đề để hiển thị ngày làm việc tĩnh của ngày hôm nay.
  * Chia bố cục grid thành 2 cột:
    * Cột trái: **Danh sách cần chuẩn bị** (các phiếu `PENDING`). Nút hành động: "Xong". Khi click, cập nhật trạng thái sang `PREPARED`.
    * Cột phải: **Danh sách sẵn sàng** (các phiếu `PREPARED`). Nút hành động: "Xác nhận bàn giao". Khi click, cập nhật trạng thái sang `DELIVERED`.

- [ ] **Step 2: Chạy kiểm thử**
  Run: `cmd /c npx jest src/__tests__/dispatch-ui.test.tsx`
  Expected: PASS

- [ ] **Step 3: Commit thay đổi**
  ```bash
  git add src/app/laundry/dispatch/page.tsx
  git commit -m "fe: split quick dispatch page into preparation and handover lists"
  ```

---

### Task 7: Modify Admin/Supervisor Dashboard `/admin/dispatch`

**Files:**
- Modify: `src/app/admin/dispatch/page.tsx`

- [ ] **Step 1: Cập nhật Thống kê và Bộ lọc**
  Chỉnh sửa `src/app/admin/dispatch/page.tsx`:
  * Cập nhật đếm số lượng hiển thị trên Stats Cards:
    * **Chờ chuẩn bị**: số lượng phiếu có trạng thái `PENDING`.
    * **Sẵn sàng bàn giao**: số lượng phiếu có trạng thái `PREPARED`.
    * **Đã bàn giao**: số lượng phiếu có trạng thái `DELIVERED`.
  * Thêm lọc theo trạng thái `PREPARED` trong dropdown bộ lọc.
  * Hiển thị nhãn trạng thái trực quan trong cột:
    * `PENDING`: "Chờ chuẩn bị" (màu indigo)
    * `PREPARED`: "Sẵn sàng bàn giao" (màu cam/tím)
    * `DELIVERED`: "Đã bàn giao" (màu emerald)

- [ ] **Step 2: Chạy bộ kiểm thử tự động toàn diện**
  Run: `cmd /c npx jest --runInBand`
  Expected: PASS (Tất cả 13 suites thành công)

- [ ] **Step 3: Commit thay đổi**
  ```bash
  git add src/app/admin/dispatch/page.tsx
  git commit -m "fe: update admin dispatch page to support prepared status statistics and filters"
  ```
