# Thiết kế Vai trò Giám sát (Supervisor Role Design Spec)

Tài liệu này mô tả thiết kế kỹ thuật cho việc bổ sung vai trò chính **Supervisor (Giám sát)** vào hệ thống quản lý đồ vải Becamex Hospital.

---

## 1. Yêu cầu & Mục tiêu (Requirements)

Vai trò **Supervisor (Giám sát)** là một vai trò chính trong hệ thống, hoạt động song song cùng với `ADMIN` và `LAUNDRY`:
*   **Phạm vi truy cập**: Chỉ được phép xem và thực hiện các nghiệp vụ tại trang Giám sát cấp phát (`/admin/dispatch`) và các API liên quan đến giám sát/cấp phát.
*   **Hạn chế bảo mật**:
    *   Bị chặn khi cố gắng truy cập các trang Admin khác (`/admin` chính, `/admin/batches`, v.v.).
    *   Bị chặn khi truy cập trang nghiệp vụ Nhà giặt (`/laundry/*`).
*   **Giao diện**:
    *   Khi đăng nhập thành công, tự động chuyển hướng đến `/admin/dispatch`.
    *   Thanh điều hướng Header của Admin chỉ hiển thị tab "Yêu cầu cấp phát" đối với tài khoản Supervisor (ẩn các tab khác).
*   **Quản lý**: Admin có thể tạo mới tài khoản Supervisor từ giao diện quản trị và cấp các quyền chi tiết tương ứng (ví dụ: `admin:view` và `admin:ticket`).

---

## 2. Schema Cơ sở dữ liệu (Database Schema)

Cập nhật enum `Role` trong `prisma/schema.prisma` để thêm `SUPERVISOR`:

```prisma
enum Role {
  ADMIN
  LAUNDRY
  SUPERVISOR
}
```

---

## 3. Quản lý Tuyến đường & Phân quyền (Route Protection & Permissions)

### Middleware (`src/proxy.ts`)
*   Đối với nhóm tuyến đường Admin (`/admin/*`):
    *   Nếu người dùng có vai trò `ADMIN`, cho phép truy cập đầy đủ.
    *   Nếu người dùng có vai trò `SUPERVISOR`, chỉ cho phép nếu tuyến đường bắt đầu bằng `/admin/dispatch`. Tất cả các tuyến đường Admin khác sẽ chuyển hướng về `/login`.
    *   Các vai trò khác bị chặn và chuyển hướng về `/login`.
*   Đối với tuyến đường Nhà giặt (`/laundry/*`):
    *   Chỉ cho phép vai trò `LAUNDRY`.

### Phân quyền API (`src/lib/jwt.ts`)
*   `UserJWTPayload` chấp nhận `role: 'ADMIN' | 'LAUNDRY' | 'SUPERVISOR'`.
*   Supervisor thực hiện các API qua token chứa quyền hạn `admin:view` (cho phép GET dữ liệu danh mục) và `admin:ticket` (cho phép xử lý phiếu yêu cầu).

---

## 4. Giao diện Người dùng (User Interface Flow)

### Đăng nhập (`src/app/login/page.tsx`)
*   Sau khi API `/api/auth/login` phản hồi vai trò `SUPERVISOR`, Client thực hiện chuyển hướng:
    ```typescript
    router.push('/admin/dispatch')
    ```

### Layout Admin (`src/app/admin/layout.tsx`)
*   Thực hiện giải mã JWT Payload từ cookie `token` ở Client để lấy vai trò hiện tại.
*   Lọc động mảng `navItems`:
    ```typescript
    const navItems = [
      { name: 'Danh mục hệ thống', href: '/admin', roles: ['ADMIN'] },
      { name: 'Lô nhập hàng', href: '/admin/batches', roles: ['ADMIN'] },
      { name: 'Yêu cầu cấp phát', href: '/admin/dispatch', roles: ['ADMIN', 'SUPERVISOR'] },
    ].filter(item => !item.roles || item.roles.includes(userRole))
    ```

### Quản trị Tài khoản (`src/app/admin/page.tsx`)
*   Thêm tuỳ chọn `SUPERVISOR` vào phần chọn vai trò chính khi tạo tài khoản:
    ```html
    <option value="SUPERVISOR">SUPERVISOR (Giám sát)</option>
    ```
*   Tự động tích chọn quyền mặc định cho Supervisor (`admin:view`, `admin:ticket`) để cải thiện trải nghiệm quản trị (UX).

---

## 5. Dữ liệu mẫu (Database Seeding)

Cập nhật `prisma/seed.ts` để gán thêm tài khoản Supervisor mặc định hỗ trợ kiểm thử:
*   Username: `supervisor`
*   Password: `password123`
*   Role: `SUPERVISOR`
*   Permissions: `['admin:view', 'admin:ticket']`
