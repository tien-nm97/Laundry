# Đặc tả Thiết kế Luồng Chuẩn bị và Bàn giao Đồ vải (Laundry Preparation & Handover Flow Design Spec)

Tài liệu này mô tả thiết kế kỹ thuật cho việc cập nhật logic nghiệp vụ Nhà giặt:
1. Hộ lý khoa phòng nhập yêu cầu.
2. Nhân viên nhà giặt chuẩn bị đồ vải và xác nhận hoàn thành chuẩn bị.
3. Phiếu chuyển sang danh sách sẵn sàng để kiểm tra lại và thực hiện bàn giao mà không thực hiện kiểm đếm đối chiếu khi giao nhận.
4. Nghiệp vụ nhà giặt rút gọn chỉ còn đúng 2 tab: "Danh sách cần chuẩn bị" và "Danh sách sẵn sàng".

---

## 1. Yêu cầu nghiệp vụ (Business Requirements)
* **Quy trình luân chuyển trạng thái phiếu (Ticket Status Flow):**
  * `PENDING` (Chờ chuẩn bị / Danh sách cần chuẩn bị)
  * `PREPARED` (Đã chuẩn bị xong / Danh sách sẵn sàng)
  * `DELIVERED` (Đã bàn giao)
* **Giao diện nghiệp vụ Nhà giặt (`/laundry`):**
  * Chỉ hiển thị 2 tab: **"Danh sách cần chuẩn bị"** (hiển thị danh sách phiếu `PENDING`, có nút **"Đã chuẩn bị xong"** để cập nhật trạng thái phiếu lên `PREPARED`) và **"Danh sách sẵn sàng"** (hiển thị danh sách phiếu `PREPARED`, có nút **"Xác nhận bàn giao"** để cập nhật trạng thái phiếu lên `DELIVERED`).
  * Loại bỏ các tab nghiệp vụ cũ không liên quan (`circulation` - Khai thác, `discard` - Báo hỏng, `report` - Báo cáo tuổi thọ) khỏi giao diện nghiệp vụ nhà giặt chính của nhân viên.
* **Giao diện Bàn giao nhanh (`/laundry/dispatch`):**
  * Tách giao diện làm 2 phần tương tự: **"Danh sách cần chuẩn bị"** (dành cho phiếu `PENDING`, nút bấm **"Đã chuẩn bị xong"**) và **"Danh sách sẵn sàng"** (dành cho phiếu `PREPARED`, nút bấm **"Xác nhận bàn giao"**).
* **Giao diện Giám sát Admin/Supervisor (`/admin/dispatch`):**
  * Cập nhật đếm số lượng thống kê theo 3 trạng thái: `Cần chuẩn bị` (PENDING), `Sẵn sàng bàn giao` (PREPARED), `Đã bàn giao` (DELIVERED).
  * Cho phép lọc và xem các phiếu ở cả 3 trạng thái.
  * Hiển thị nhãn trạng thái trực quan trong bảng lịch sử: "Chờ chuẩn bị", "Sẵn sàng bàn giao", "Đã bàn giao".

---

## 2. Schema Cơ sở dữ liệu (Database Schema)

Cập nhật enum `TicketStatus` trong [schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma) để hỗ trợ trạng thái trung gian `PREPARED`:

```prisma
enum TicketStatus {
  PENDING
  PREPARED
  DELIVERED
}
```

---

## 3. Thiết kế APIs (API Endpoint Design)

### API Nghiệp vụ nhà giặt (`/api/laundry/tickets/route.ts`)
* **`GET`**: Lấy danh sách các phiếu yêu cầu có trạng thái `PENDING` hoặc `PREPARED`.
* **`PUT`**:
  * Kiểm tra đầu vào `ticketId`.
  * Nếu phiếu đang là `PENDING`, cập nhật thành `PREPARED`.
  * Nếu phiếu đang là `PREPARED`, cập nhật thành `DELIVERED` và ghi nhận `deliveryDate = new Date()`.

### API Bàn giao nhanh (`/api/dispatch/tickets/route.ts`)
* **`GET`**: Lấy danh sách các phiếu yêu cầu có trạng thái `PENDING` hoặc `PREPARED`.
* **`PUT`**:
  * Nhận `ticketId`.
  * Cập nhật trạng thái tương tự như API nhà giặt: chuyển đổi trạng thái kế tiếp (`PENDING` -> `PREPARED` -> `DELIVERED`).

---

## 4. Thiết kế Giao diện (User Interface Flow)

### Trang Nghiệp vụ Nhà giặt (`src/app/laundry/page.tsx`)
* Cấu trúc Tabs:
  ```typescript
  const [activeTab, setActiveTab] = useState<'prepare' | 'ready'>('prepare')
  ```
* Bố cục:
  * Tab **"Danh sách cần chuẩn bị"**:
    * Hiển thị danh sách phiếu có `status === 'PENDING'`.
    * Chi tiết phiếu hiển thị nút: **"Đã chuẩn bị xong"** (gọi API chuyển trạng thái sang `PREPARED`).
  * Tab **"Danh sách sẵn sàng"**:
    * Hiển thị danh sách phiếu có `status === 'PREPARED'`.
    * Chi tiết phiếu hiển thị nút: **"Xác nhận bàn giao"** (gọi API chuyển trạng thái sang `DELIVERED`).

### Trang Bàn giao nhanh (`src/app/laundry/dispatch/page.tsx`)
* Chia đôi bố cục hoặc xếp chồng 2 danh sách rõ rệt:
  * Nhóm phiếu **"Danh sách cần chuẩn bị"** (`status === 'PENDING'`) - Nút hành động: **"Đã chuẩn bị xong"**.
  * Nhóm phiếu **"Danh sách sẵn sàng"** (`status === 'PREPARED'`) - Nút hành động: **"Xác nhận bàn giao"**.

### Trang Giám sát Admin/Supervisor (`src/app/admin/dispatch/page.tsx`)
* **Thống kê (Stats Cards):**
  * Số phiếu "Chờ chuẩn bị" (`status === 'PENDING'`).
  * Số phiếu "Sẵn sàng bàn giao" (`status === 'PREPARED'`).
  * Số phiếu "Đã bàn giao" (`status === 'DELIVERED'`).
* **Nhật ký yêu cầu cấp phát:**
  * Thêm tùy chọn lọc trạng thái: Tất cả (`ALL`), Chờ chuẩn bị (`PENDING`), Sẵn sàng bàn giao (`PREPARED`), Đã giao (`DELIVERED`).
  * Nhãn hiển thị trạng thái trong cột:
    * `PENDING`: "Chờ chuẩn bị" (Màu xanh dương/indigo nhạt)
    * `PREPARED`: "Sẵn sàng bàn giao" (Màu cam/tím nhạt)
    * `DELIVERED`: "Đã giao" (Màu emerald)

---

## 5. Kế hoạch kiểm thử & Xác minh (Verification Plan)

### Kiểm thử Tự động (Automated Tests)
* Cập nhật và bổ sung các test cases tương ứng trong `src/__tests__/laundry.test.ts` và `src/__tests__/dispatch-api.test.ts` để kiểm thử luồng cập nhật trạng thái mới.
* Chạy bộ kiểm thử tự động tuần tự bằng lệnh:
  ```bash
  npx jest --runInBand
  ```

### Kiểm thử Thủ công (Manual Verification)
* Giả lập vai trò hộ lý tạo phiếu yêu cầu đồ vải.
* Đăng nhập vai trò nhà giặt, kiểm tra tab "Danh sách cần chuẩn bị" có xuất hiện phiếu mới.
* Nhấn "Đã chuẩn bị xong" và kiểm tra phiếu biến mất khỏi tab này và xuất hiện bên tab "Danh sách sẵn sàng".
* Nhấn "Xác nhận bàn giao" trên tab "Danh sách sẵn sàng" và kiểm tra phiếu biến mất khỏi giao diện nhà giặt.
* Đăng nhập vai trò Admin/Supervisor, kiểm tra thống kê và nhật ký trạng thái hiển thị đúng quá trình chuyển đổi.
