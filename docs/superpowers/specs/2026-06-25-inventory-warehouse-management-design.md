# Thiết kế Phân hệ Quản lý kho và Tái chế Đồ vải (Inventory & Recycling Spec)

Tài liệu này mô tả thiết kế chi tiết cho việc tái cấu trúc trang quản lý lô nhập hàng thành trang **"Quản lý kho"** tích hợp các chức năng nhập kho, thống kê lưu lượng đồ vải (kho gốc, đang lưu hành, báo hỏng), và nghiệp vụ báo hỏng/tái chế ga giường cũ thành vỏ gối.

---

## 1. Yêu cầu nghiệp vụ (Business Requirements)

1. **Đổi tên phân hệ & Đường dẫn**:
   - Chuyển đổi và đổi tên menu điều hướng từ *"Lô nhập hàng"* thành **"Quản lý kho"**.
   - Href thay đổi từ `/admin/batches` thành `/admin/inventory`.
   - Phân quyền: Cả `ADMIN` và `SUPERVISOR` (Giám sát bộ phận) đều được phép truy cập và thực hiện thao tác trên trang này.

2. **Bảng thống kê kho (Aggregated Inventory Table)**:
   - Thống kê toàn bộ số lượng đồ vải lưu hành trong hệ thống theo từng loại đồ vải (`LinenType`), gồm:
     - **Tồn kho gốc**: Tổng trữ lượng còn lại trong kho chưa khai thác (tổng `remainingQuantity` của các `Batch` thuộc loại đó).
     - **Đang lưu hành**: Tổng số lượng đang được sử dụng ở các khoa phòng/nhà giặt (tổng `activeQuantity` của các `LinenCirculation` thuộc loại đó).
     - **Đã báo hỏng**: Tổng số lượng đồ vải đã bị hỏng/thanh lý/đưa đi tái chế (tổng `discardedQuantity` của các `LinenCirculation` thuộc loại đó).
     - **Tổng tích lũy**: `Tồn kho gốc` + `Đang lưu hành` + `Đã báo hỏng`.

3. **Chức năng Nhập lô hàng mới (Import Batch)**:
   - Thay thế form nhập tĩnh bằng một nút bấm *"＋ Nhập lô hàng mới"* ở góc trên bên phải, khi bấm vào sẽ mở Modal biểu mẫu nhập lô hàng.
   - Hỗ trợ nhập đồng thời nhiều loại đồ vải trong một mã lô hàng (`BATCH-YYYYMMDD`).

4. **Chức năng Báo hỏng & Tái chế (Discard & Recycle)**:
   - Nút bấm *"⚠ Báo hỏng & Tái chế"* cạnh nút nhập lô hàng mở ra Modal xử lý hao hụt.
   - Admin/Supervisor chọn một lô đồ vải đang lưu hành (`LinenCirculation` có `activeQuantity > 0`).
   - Nhập số lượng cần báo hỏng.
   - Chọn phương thức:
     - **Thanh lý / Hủy bỏ**: Báo hỏng thông thường, giảm lượng lưu hành.
     - **Tái chế thành Vỏ gối**: Chỉ cho phép khi mặt hàng chọn thuộc loại **Drap (Ga giường)**.
   - Nếu chọn tái chế, nhập thêm số lượng vỏ gối thu được (admin tự nhập sau khi có phản hồi từ nhà cung cấp).
   - Hệ thống sẽ tạo một lô nhập gốc (`Batch`) mới cho **Vỏ gối** tương ứng với lượng thu hồi.

---

## 2. Thiết kế Cơ sở dữ liệu & API (Database & API Design)

### 2.1 Cập nhật Phân quyền & Middleware (`src/proxy.ts`)
Cho phép vai trò `SUPERVISOR` truy cập trang `/admin/inventory`:
```typescript
const isDispatchRoute = pathname.startsWith('/admin/dispatch')
const isInventoryRoute = pathname.startsWith('/admin/inventory')
if (payload.role === 'ADMIN') {
  // Cho phép
} else if (payload.role === 'SUPERVISOR' && (isDispatchRoute || isInventoryRoute)) {
  // Cho phép
} else {
  // Chặn & redirect về /login
}
```

### 2.2 Các Endpoints API

#### 1. Lấy dữ liệu kho hàng: `GET /api/admin/inventory`
- **Quyền truy cập**: Yêu cầu đăng nhập và có quyền `'admin:view'` (cả ADMIN và SUPERVISOR đều có).
- **Phản hồi (Response - 200 OK)**:
  ```json
  {
    "inventory": [
      {
        "linenTypeId": "uuid",
        "name": "Mền xanh",
        "unit": "Cái",
        "originalStock": 120,
        "inCirculation": 80,
        "discarded": 5,
        "totalAccumulated": 205
      }
    ],
    "batches": [
      // Danh sách tất cả Batch (sắp xếp theo ngày nhập mới nhất)
    ],
    "activeCirculations": [
      // Danh sách LinenCirculation có activeQuantity > 0 phục vụ dropdown Báo hỏng
    ]
  }
  ```

#### 2. Nhập lô hàng mới: `POST /api/admin/batches` (Tái sử dụng & cải tiến)
- **Quyền truy cập**: Cho phép role `ADMIN` (hoặc có quyền `'admin:batch'`) **HOẶC** role `SUPERVISOR`.
- logic được giữ nguyên nhưng nới lỏng phân quyền cho phép cả Supervisor thực hiện.

#### 3. Báo hỏng và Tái chế: `POST /api/admin/inventory/recycle`
- **Quyền truy cập**: Cho phép role `ADMIN` (hoặc có quyền `'admin:batch'`) **HOẶC** role `SUPERVISOR`.
- **Dữ liệu yêu cầu (Request Body)**:
  ```json
  {
    "linenCirculationId": "uuid-circulation-cần-báo-hỏng",
    "discardQuantity": 5,
    "action": "DISCARD" | "RECYCLE",
    "recycledQuantity": 10 // Chỉ truyền nếu action là RECYCLE
  }
  ```
- **Xử lý Transaction**:
  1. Lấy thông tin `LinenCirculation` theo `linenCirculationId`, kiểm tra `activeQuantity >= discardQuantity`.
  2. Cập nhật `LinenCirculation`:
     - Giảm `activeQuantity` đi `discardQuantity`.
     - Tăng `discardedQuantity` thêm `discardQuantity`.
  3. Tạo nhật ký báo hỏng `LinenDiscardLog`:
     - `linenCirculationId`: ID lô lưu hành nguồn.
     - `quantity`: `discardQuantity`.
     - `reason`:
       - Nếu action là `RECYCLE`: `"Tái chế thành Vỏ gối (Thu hồi: ${recycledQuantity} cái)"`.
       - Nếu action là `DISCARD`: `"Báo hỏng thông thường"`.
  4. Nếu action là `RECYCLE`:
     - Tìm `LinenType` tên `"Vỏ gối"` (không phân biệt hoa thường). Nếu không có, tạo mới: `{ name: "Vỏ gối", unit: "Cái" }`.
     - Tạo một `Batch` mới cho Vỏ gối:
       - `code`: `RECYCLE-${YYYYMMDD}` (dựa trên ngày hiện tại).
       - `linenTypeId`: ID của loại vải Vỏ gối.
       - `totalQuantity`: `recycledQuantity`.
       - `remainingQuantity`: `recycledQuantity`.
       - `importedAt`: Thời gian hiện tại.

---

## 3. Thiết kế Giao diện (UI Design)

### 3.1 Cập nhật Menu sidebar (`src/app/admin/layout.tsx`)
Thay đổi mục menu:
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
}
```

### 3.2 Trang Quản lý kho (`src/app/admin/inventory/page.tsx`)
- **KPI Cards Row**: 3 thẻ thông tin:
  - *Tồn kho gốc* (Màu xanh dương chủ đạo)
  - *Đang lưu hành* (Màu ngọc lục bảo)
  - *Đã báo hỏng* (Màu hoa hồng)
- **Bảng Thống kê kho**: Hiển thị lưới tổng hợp theo từng `LinenType`.
- **Bảng Lịch sử các lô hàng nhập**: Kèm bộ hiển thị tiến trình (progress bar) thể hiện trữ lượng còn lại (`remainingQuantity / totalQuantity`).

### 3.3 Các Modals
- **Nhập lô hàng mới**: Modal chứa form nhập liệu như cũ, đóng/mở linh hoạt.
- **Báo hỏng & Tái chế**:
  - Chọn lô đang lưu thông: Sử dụng danh sách `activeCirculations`.
  - Nhập số lượng báo hỏng: Xác thực giới hạn `<= activeQuantity` của lô chọn.
  - Chọn hình thức xử lý: Radio buttons "Hủy bỏ/Thanh lý" hoặc "Tái chế thành Vỏ gối". Tùy chọn "Tái chế" chỉ xuất hiện khi loại vải của lô chọn chứa từ khóa `"drap"`, `"ga trải"`, hoặc `"ga giường"`.
  - Nhập số lượng vỏ gối thu hồi: Chỉ hiện khi chọn "Tái chế".

---

## 4. Kế hoạch Kiểm thử (Verification Plan)

1. **Unit Tests**:
   - Tạo bộ test mới `src/__tests__/inventory.test.ts` kiểm tra:
     - `GET /api/admin/inventory`: Trả về dữ liệu tổng hợp chính xác theo cấu trúc.
     - `POST /api/admin/inventory/recycle` (Báo hỏng): Giảm lưu hành, tăng hao hụt, lưu log chuẩn xác.
     - `POST /api/admin/inventory/recycle` (Tái chế): Thực hiện nghiệp vụ báo hỏng Drap và sinh ra lô Batch mới cho Vỏ gối với số lượng thu hồi chính xác.
     - Kiểm tra phân quyền: `ADMIN` và `SUPERVISOR` đều có quyền thao tác các API này; `LAUNDRY` bị từ chối `403`.
2. **Kiểm thử Giao diện (Manual UI Verification)**:
   - Kiểm tra hiển thị menu và định tuyến trang cho tài khoản Admin và Supervisor.
   - Thử nghiệm mở các Modal, nhập dữ liệu báo hỏng, kiểm tra tính năng ẩn hiện động của phần nhập vỏ gối tái chế khi chọn Ga giường/Drap.
