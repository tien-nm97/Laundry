# Thiết kế Chức năng Tạo User và Phân quyền Tùy chỉnh (Admin User Management & Permissions)

Tài liệu này đặc tả thiết kế kỹ thuật cho chức năng quản lý tài khoản và phân quyền chi tiết, được tích hợp trực tiếp vào giao diện quản trị viên của hệ thống quản lý đồ vải bệnh viện.

---

## 1. Yêu cầu & Ràng buộc bảo mật (Requirements & Security Constraints)

*   **Tính năng:**
    *   Xem danh sách toàn bộ các tài khoản người dùng đang hoạt động trong hệ thống.
    *   Tạo người dùng mới với Tên đăng nhập (username), Mật khẩu (password) và tùy chọn danh sách các quyền hạn được phân.
    *   Cập nhật danh sách quyền của người dùng hiện có.
    *   Đặt lại mật khẩu cho người dùng hiện có.
    *   Xóa tài khoản người dùng hiện có.
*   **Bảo mật & Ràng buộc:**
    *   Quy tắc mật khẩu: Đơn giản, tối thiểu 6 ký tự.
    *   Chỉ các tài khoản có quyền `admin:users` mới có thể gọi API quản lý tài khoản hoặc xem bảng điều khiển quản lý tài khoản.
    *   Không cho phép người dùng đang đăng nhập tự xóa tài khoản của chính mình hoặc tự tước bỏ quyền `admin:users` của mình để tránh bị khóa hệ thống (lockout).
    *   Bảo vệ ở tầng API: Xác thực JWT token từ cookie và kiểm tra danh sách quyền tương ứng với mỗi hành động.

---

## 2. Thiết kế Cơ sở Dữ liệu (Database Schema Update)

Cập nhật model `User` trong [schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma) để lưu trữ danh sách quyền dưới dạng mảng chuỗi (`String[]`), ánh xạ với kiểu mảng (`text[]`) trong PostgreSQL:

```prisma
model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  role         Role     @default(LAUNDRY)
  permissions  String[] @default([]) // Thêm mới để lưu danh sách các quyền được gán
  createdAt    DateTime @default(now())
}
```

### Danh sách các mã quyền (Permission Keys)

Hệ thống sẽ định nghĩa và sử dụng các chuỗi mã quyền sau:
1.  `admin:view`: Quyền truy cập trang Admin Dashboard chung.
2.  `admin:linen`: Quyền tạo/quản lý các Loại đồ vải.
3.  `admin:ward`: Quyền tạo Khoa phòng và lấy liên kết mã QR.
4.  `admin:staff`: Quyền thêm/sửa/xóa nhân viên Hộ lý.
5.  `admin:batch`: Quyền nhập lô hàng mới và xem lịch sử lô hàng.
6.  `admin:ticket`: Quyền xử lý và xác nhận yêu cầu cấp phát đồ vải.
7.  `admin:users`: Quyền tạo mới, đổi mật khẩu, phân quyền và xóa các tài khoản người dùng.
8.  `laundry:view`: Quyền truy cập và thao tác trên giao diện nghiệp vụ Nhà giặt (quét đồ, báo loại...).

---

## 3. Thiết kế APIs (`/api/admin/users`)

Tạo mới API Route tại [route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/users/route.ts) hỗ trợ các phương thức:

*   **`GET /api/admin/users`:** Lấy danh sách toàn bộ người dùng (loại bỏ `passwordHash` ra khỏi kết quả trả về).
    *   *Yêu cầu quyền:* `admin:users`
*   **`POST /api/admin/users`:** Tạo tài khoản mới.
    *   *Payload:* `{ username, password, role, permissions: string[] }`
    *   *Yêu cầu quyền:* `admin:users`
    *   *Xử lý:* Mã hóa mật khẩu bằng `bcryptjs.hash(password, 10)` trước khi lưu.
*   **`PUT /api/admin/users`:** Cập nhật thông tin tài khoản (quyền hạn hoặc mật khẩu).
    *   *Payload:* `{ id, role, permissions: string[], password?: string }`
    *   *Yêu cầu quyền:* `admin:users`
    *   *Ràng buộc:* Nếu tài khoản được cập nhật trùng với tài khoản đang thực hiện yêu cầu, chặn việc thay đổi/hạ quyền `admin:users` của chính mình.
*   **`DELETE /api/admin/users?id=...`:** Xóa tài khoản người dùng.
    *   *Yêu cầu quyền:* `admin:users`
    *   *Ràng buộc:* Chặn việc tự xóa chính mình.

---

## 4. Thiết kế Giao diện (UI Layout)

Trang chủ quản trị viên [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx) sẽ được sắp xếp lại bố cục từ lưới 3 cột thành lưới 2 cột rộng rãi (`grid-cols-1 md:grid-cols-2 gap-8`):

*   **Cột 1 (Dòng 1):** Quản lý Loại đồ vải (Linen Types)
*   **Cột 2 (Dòng 1):** Quản lý Khoa phòng & QR Link (Wards & QR)
*   **Cột 1 (Dòng 2):** Quản lý Nhân viên Hộ lý (Staff)
*   **Cột 2 (Dòng 2):** Quản lý Tài khoản & Phân quyền (Mới)
    *   *Bố cục:*
        *   Form tạo user mới: Gồm Username, Password, và danh sách Checkbox quyền.
        *   Bảng hiển thị các User: Hiển thị danh sách Username, các nhãn (badge) đại diện cho quyền đã gán, các nút "Đổi quyền", "Mật khẩu" (mở modal tương ứng) và nút "Xóa".

---

## 5. Kế hoạch kiểm thử & Xác minh (Verification Plan)

*   **Kiểm thử tự động:**
    *   Viết test case API trong `src/__tests__/users-api.test.ts` để kiểm tra: tạo tài khoản thành công, phân quyền chính xác, chặn mật khẩu ngắn hơn 6 ký tự, chặn tự xóa/tự hạ quyền chính mình, chặn truy cập trái phép khi không có quyền `admin:users`.
*   **Kiểm thử thủ công:**
    *   Kiểm tra việc tạo tài khoản, đăng nhập bằng tài khoản vừa tạo và kiểm tra xem tài khoản đó có bị hạn chế quyền truy cập/thao tác đúng theo thiết kế hay không.
