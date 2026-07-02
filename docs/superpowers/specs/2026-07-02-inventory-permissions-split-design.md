# Đặc tả Thiết kế: Phân tách chi tiết Quyền Can thiệp Kho đồ vải (inventory:manage)

Tài liệu này đặc tả phương án phân rã quyền hạn `inventory:manage` (quyền can thiệp kho nói chung) thành các quyền năng nghiệp vụ riêng lẻ và loại bỏ các logic tương thích ngược liên quan đến kho đồ vải.

---

## 1. Cấu hình Quyền mới trong `permissions.ts`

Nhóm quyền **Quản lý Kho đồ vải** (`inventory`) được cập nhật như sau:

- **Quyền cha:** `inventory:all` (Toàn quyền Quản lý Kho)
- **Quyền con (Chi tiết):**
  - `inventory:view`: Xem số liệu tồn kho gốc, lượng lưu hành, lượng báo hỏng, và nhật ký biến động.
  - `inventory:import`: Được phép thêm (nhập) các lô hàng mới vào kho.
  - `inventory:circulate`: Được phép đưa đồ vải sạch từ kho vào lưu hành thực tế.
  - `inventory:discard`: Được phép báo hỏng đồ vải / đề xuất tái chế (ga giường cũ sang vỏ gối).
  - `inventory:min_stock`: Được phép chỉnh sửa định mức tồn tối thiểu của từng loại đồ vải.

### Loại bỏ tương thích ngược (Phương án B):
Trong hàm `hasPermission`, các ánh xạ lịch sử đối với các quyền kho sau sẽ bị loại bỏ hoàn toàn:
- `admin:batch`
- `supervisor:laundry_damage`
- `inventory:min_stock`
- `supervisor:laundry_procure`
- `inventory:view_stock`
- `inventory:manage`

---

## 2. API Endpoints Phân quyền

Mỗi API route quản lý kho sẽ kiểm tra chính xác quyền nghiệp vụ mới thông qua hàm `verifyPermission`:

| API Endpoint | Method | Quyền yêu cầu mới |
| :--- | :--- | :--- |
| `/api/admin/inventory/circulate` | `POST` | `inventory:circulate` |
| `/api/admin/inventory/min-stock` | `PUT` | `inventory:min_stock` |
| `/api/admin/inventory/recycle` | `POST` | `inventory:discard` |
| `/api/admin/inventory/recycle/propose` | `POST` | `inventory:discard` |
| `/api/admin/inventory/recycle/approve` | `POST` | `ADMIN` (Giữ nguyên cho tài khoản ADMIN chính) |

---

## 3. Kiểm soát Giao diện (UI Controls)

Trong trang quản trị kho ([page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/inventory/page.tsx)), các nút hành động sẽ hiển thị dựa theo quyền hạn mới:

1. **Nút "Nhập lô hàng mới"**:
   - Điều kiện hiển thị: `userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:import')`
2. **Nút "Báo hỏng & Tái chế"**:
   - Điều kiện hiển thị: `userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:discard')`
3. **Nút "Đưa vào sử dụng"**:
   - Điều kiện hiển thị: `userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:circulate')`
4. **Nút "Chỉnh sửa định mức tồn tối thiểu"**:
   - Điều kiện hiển thị: `userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:min_stock')`

---

## 4. Dữ liệu mẫu (Seed Data)

Cập nhật tệp [seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts):
- Tài khoản `admin` sở hữu tất cả quyền hạn mới.
- Tài khoản `supervisor_laundry` sẽ được cập nhật các quyền mới thay thế: `admin:view`, `inventory:import`, `inventory:discard`, `inventory:min_stock`, `inventory:circulate`.
