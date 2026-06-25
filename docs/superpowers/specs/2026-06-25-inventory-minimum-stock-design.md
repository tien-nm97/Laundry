# Đặc tả Thiết kế: Cấu hình Định mức Tồn kho Tối thiểu

Tài liệu này mô tả thiết kế kỹ thuật cho tính năng **Cài đặt định mức Tồn tối thiểu** và **Cảnh báo đặt hàng tự động** trên trang Quản lý kho.

---

## 1. Mục tiêu (Goals)
- Thay thế cột "Tổng tích lũy" trong bảng thống kê kho bằng cột **"Tồn tối thiểu"** (Minimum Stock).
- Cho phép người dùng (vai trò `ADMIN` hoặc `SUPERVISOR`) cấu hình ngưỡng tồn tối thiểu cho từng loại đồ vải qua một Modal chỉnh sửa tập trung.
- Hiển thị cảnh báo trực quan (Ví dụ: màu đỏ hoặc nhãn cảnh báo) khi số lượng **Tồn kho gốc** của bất kỳ đồ vải nào giảm xuống dưới hoặc bằng ngưỡng tối thiểu đã cấu hình.

---

## 2. Mô hình Dữ liệu (Database Schema)
Bổ sung trường `minStock` vào model `LinenType` trong tệp [schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma):

```prisma
model LinenType {
  id           String             @id @default(uuid())
  name         String             @unique
  unit         String
  minStock     Int                @default(0) // Số lượng tồn kho gốc tối thiểu định mức
  createdAt    DateTime           @default(now())
  batches      Batch[]
  circulations LinenCirculation[]
  ticketItems  TicketItem[]

  @@map("Loại đồ vải")
}
```

*Migration Command:*
```bash
npx.cmd prisma migrate dev --name add_min_stock_to_linen_type
```

---

## 3. Thiết kế API Backend

### 3.1 Cập nhật API GET `/api/admin/inventory`
- **Tệp sửa đổi:** `src/app/api/admin/inventory/route.ts`
- **Mô tả:** Đính kèm trường `minStock` của mỗi loại đồ vải trong phản hồi JSON của mảng `inventory`.
- **Dữ liệu trả về mẫu:**
  ```json
  {
    "inventory": [
      {
        "linenTypeId": "uuid-1",
        "name": "Ga giường",
        "unit": "Tấm",
        "originalStock": 45,
        "inCirculation": 120,
        "discarded": 15,
        "minStock": 50
      }
    ],
    "batches": [...],
    "activeCirculations": [...]
  }
  ```

### 3.2 API mới cập nhật định mức `PUT /api/admin/inventory/min-stock`
- **Tệp tạo mới:** `src/app/api/admin/inventory/min-stock/route.ts`
- **Phương thức:** `PUT`
- **Phân quyền:** Chỉ `ADMIN` hoặc `SUPERVISOR` (dựa trên JWT token cookie).
- **Yêu cầu Body:**
  ```json
  [
    { "linenTypeId": "uuid-1", "minStock": 50 },
    { "linenTypeId": "uuid-2", "minStock": 20 }
  ]
  ```
- **Nghiệp vụ:**
  - Chạy một database transaction thực hiện cập nhật trường `minStock` cho toàn bộ các bản ghi `LinenType` được gửi lên.
  - Phản hồi: `200 OK` kèm kết quả cập nhật hoặc `400/500` nếu lỗi.

---

## 4. Thiết kế Giao diện UI (`src/app/admin/inventory/page.tsx`)

### 4.1 Bảng thống kê lượng tồn kho
- Thay thế cột `"Tổng tích lũy"` bằng cột `"Tồn tối thiểu"`.
- Tiêu đề cột sẽ hiển thị: **"Tồn tối thiểu ✏️"** (kèm icon bút chì chỉnh sửa màu xanh dương nhỏ hoặc xám nhạt).
- Hover vào icon này sẽ hiển thị tooltip gợi ý: *"Nhấp để chỉnh sửa định mức"*. Khi click sẽ mở Modal Cài đặt.
- Cột "Tồn kho gốc" sẽ được áp dụng **Cảnh báo tự động**:
  - Nếu `originalStock <= minStock` (với điều kiện `minStock > 0`):
    - Con số tồn kho gốc sẽ chuyển sang màu đỏ và in đậm.
    - Hiển thị thêm một badge cảnh báo nhỏ kế bên: `⚠️ Dưới định mức` (hoặc màu đỏ cam tinh tế) để gây chú ý cho giám sát tiến hành yêu cầu đặt hàng.

### 4.2 Modal Cấu hình định mức tồn kho tối thiểu
- **Tiêu đề:** "Cài đặt định mức tồn tối thiểu"
- **Nội dung:** Danh sách tất cả các loại đồ vải hiện có (lấy từ dữ liệu API `/api/admin/inventory`), mỗi dòng gồm:
  - Tên loại đồ vải (kèm đơn vị tính).
  - Ô nhập số (`input type="number"` với thuộc tính `min="0"`), nhận giá trị mặc định là `minStock` hiện tại của loại đồ vải đó.
- **Thao tác hành động:**
  - Nút **"Lưu cấu hình"**: Gửi API `PUT /api/admin/inventory/min-stock`. Khi thành công, đóng modal, hiển thị thông báo thành công và gọi lại API tải dữ liệu kho.
  - Nút **"Hủy"**: Đóng modal và không lưu các chỉnh sửa tạm thời.

---

## 5. Kế hoạch Kiểm thử (Verification Plan)

### 5.1 Unit Tests
- Thêm bộ test mới trong `src/__tests__/inventory.test.ts` kiểm tra:
  - API `GET /api/admin/inventory` trả về trường `minStock` chính xác.
  - API `PUT /api/admin/inventory/min-stock` cập nhật thành công các định mức mới vào cơ sở dữ liệu đối với vai trò `ADMIN` và `SUPERVISOR`.
  - Phản quyền: Người dùng vai trò `LAUNDRY` hoặc không đăng nhập bị từ chối `403/401` khi gọi API cập nhật định mức.

### 5.2 Kiểm thử Thủ công (Manual UI Verification)
- Click vào icon ✏️ ở cột "Tồn tối thiểu" và mở Modal.
- Nhập giá trị mới cho một số loại đồ vải và bấm lưu, kiểm tra xem số liệu cập nhật ngay lập tức mà không cần F5.
- Cấu hình thử ngưỡng tồn tối thiểu lớn hơn Tồn kho gốc hiện tại của một loại đồ vải để kiểm tra xem hệ thống có hiển thị cảnh báo đỏ và badge `⚠️ Dưới định mức` chính xác hay không.
