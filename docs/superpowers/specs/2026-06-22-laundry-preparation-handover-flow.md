# Đặc tả Thiết kế Luồng Chuẩn bị và Bàn giao Đồ vải (Laundry Preparation & Handover Flow Design Spec)

Tài liệu này mô tả thiết kế kỹ thuật cho việc cập nhật logic nghiệp vụ Nhà giặt:
1. Hộ lý khoa phòng nhập yêu cầu.
2. Nhân viên nhà giặt chuẩn bị đồ vải và xác nhận hoàn thành chuẩn bị.
3. Phiếu chuyển sang danh sách sẵn sàng để kiểm tra lại và thực hiện bàn giao mà không thực hiện kiểm đếm đối chiếu khi giao nhận.
4. Nghiệp vụ nhà giặt rút gọn chỉ còn đúng 2 tab: "Danh sách cần chuẩn bị" và "Danh sách sẵn sàng".
5. Tích hợp lọc theo ngày (mặc định hiển thị ngày hiện tại). Phiếu của ngày cũ sẽ không xuất hiện để tránh gây rối cho nhân viên nhà giặt.

---

## 1. Yêu cầu nghiệp vụ (Business Requirements)
* **Quy trình luân chuyển trạng thái phiếu (Ticket Status Flow):**
  * `PENDING` (Chờ chuẩn bị / Danh sách cần chuẩn bị)
  * `PREPARED` (Đã chuẩn bị xong / Danh sách sẵn sàng)
  * `DELIVERED` (Đã bàn giao)
* **Cơ chế tự động xác định ngày bàn giao mục tiêu (`deliveryDate`):**
  * Khi Hộ lý tạo phiếu yêu cầu (API `POST /api/request/order`):
    * Nếu tạo vào **buổi chiều** (từ 12:00 trưa trở đi), ngày bàn giao mục tiêu (`deliveryDate`) tự động được đặt là **ngày hôm sau** (ngày mai).
    * Nếu tạo vào **buổi sáng** (trước 12:00 trưa), ngày bàn giao mục tiêu (`deliveryDate`) được đặt là **ngày hôm nay**.
* **Hiển thị & Lọc theo ngày (Date Filter logic):**
  * Nhân viên nhà giặt chỉ tập trung làm việc theo từng ngày. Do đó, giao diện nhà giặt sẽ hiển thị bộ chọn ngày (Date Picker) mặc định là **ngày hôm nay**.
  * Chỉ các phiếu yêu cầu có ngày bàn giao mục tiêu trùng với ngày đang chọn mới được hiển thị. Khi ngày kết thúc (sang ngày mới), bộ chọn ngày mặc định nhảy sang ngày mới, giúp các phiếu của ngày cũ tự động ẩn đi để tránh gây rối cho nhân viên nhà giặt.
* **Giao diện nghiệp vụ Nhà giặt (`/laundry`):**
  * Chỉ hiển thị 2 tab chính: **"Danh sách cần chuẩn bị"** (hiển thị danh sách phiếu `PENDING`) và **"Danh sách sẵn sàng"** (hiển thị danh sách phiếu `PREPARED`).
  * Tích hợp bộ hiển thị/chọn ngày ở phía trên danh sách.
  * Loại bỏ các tab nghiệp vụ cũ không liên quan (`circulation` - Khai thác, `discard` - Báo hỏng, `report` - Báo cáo tuổi thọ) khỏi giao diện nhà giặt chính của nhân viên.
* **Giao diện Bàn giao nhanh (`/laundry/dispatch`):**
  * Tách giao diện làm 2 phần tương tự: **"Danh sách cần chuẩn bị"** (dành cho phiếu `PENDING`, nút bấm **"Đã chuẩn bị xong"**) và **"Danh sách sẵn sàng"** (dành cho phiếu `PREPARED`, nút bấm **"Xác nhận bàn giao"**).
  * Tích hợp hiển thị ngày tháng đang làm việc ở đầu trang và cho phép đổi ngày.
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

### API Tạo phiếu yêu cầu (`/api/request/order/route.ts`)
* **`POST`**:
  * Khi tạo phiếu, xác định `deliveryDate`:
    ```typescript
    const now = new Date()
    const deliveryDate = new Date(now)
    if (now.getHours() >= 12) {
      deliveryDate.setDate(now.getDate() + 1)
    }
    // Thiết lập giờ của deliveryDate về 00:00:00.000 để chuẩn hóa ngày
    deliveryDate.setHours(0, 0, 0, 0)
    ```

### API Nghiệp vụ nhà giặt (`/api/laundry/tickets/route.ts`)
* **`GET`**: 
  * Nhận tham số truy vấn `date` (định dạng `YYYY-MM-DD`). Mặc định nếu không truyền sẽ lấy ngày hôm nay (theo giờ local).
  * Lọc các phiếu có trạng thái `PENDING` hoặc `PREPARED` và có `deliveryDate` trùng với ngày được lọc.
    ```typescript
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)
    
    // Query
    where: {
      status: { in: ['PENDING', 'PREPARED'] },
      deliveryDate: {
        gte: startOfDay,
        lte: endOfDay,
      }
    }
    ```
* **`PUT`**:
  * Kiểm tra đầu vào `ticketId`.
  * Nếu phiếu đang là `PENDING`, cập nhật thành `PREPARED`.
  * Nếu phiếu đang là `PREPARED`, cập nhật thành `DELIVERED` và ghi nhận `deliveryDate = new Date()` (ngày thực tế bàn giao).

### API Bàn giao nhanh (`/api/dispatch/tickets/route.ts`)
* **`GET`**: Nhận tham số `date` và lọc tương tự API nhà giặt.
* **`PUT`**:
  * Nhận `ticketId`.
  * Cập nhật trạng thái tương tự như API nhà giặt: chuyển đổi trạng thái kế tiếp (`PENDING` -> `PREPARED` -> `DELIVERED`).

---

## 4. Thiết kế Giao diện (User Interface Flow)

### Trang Nghiệp vụ Nhà giặt (`src/app/laundry/page.tsx`)
* Cấu trúc Tabs:
  ```typescript
  const [activeTab, setActiveTab] = useState<'prepare' | 'ready'>('prepare')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  ```
* Bố cục:
  * Phía trên thanh Tabs: Có thanh hiển thị ngày hiện tại dạng Input Date hoặc nút mũi tên chuyển ngày nhanh (Hôm nay / Hôm qua / Hôm sau).
  * Tab **"Danh sách cần chuẩn bị"**:
    * Hiển thị danh sách phiếu có `status === 'PENDING'`.
    * Chi tiết phiếu hiển thị nút: **"Đã chuẩn bị xong"** (gọi API chuyển trạng thái sang `PREPARED`).
  * Tab **"Danh sách sẵn sàng"**:
    * Hiển thị danh sách phiếu có `status === 'PREPARED'`.
    * Chi tiết phiếu hiển thị nút: **"Xác nhận bàn giao"** (gọi API chuyển trạng thái sang `DELIVERED`).

### Trang Bàn giao nhanh (`src/app/laundry/dispatch/page.tsx`)
* Phía đầu trang có bộ chọn ngày: Mặc định là ngày hôm nay.
* Chia đôi bố cục hoặc xếp chồng 2 danh sách rõ rệt cho ngày được chọn:
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
* Cập nhật và bổ sung các test cases tương ứng trong `src/__tests__/laundry.test.ts` và `src/__tests__/dispatch-api.test.ts` để kiểm thử luồng cập nhật trạng thái mới và lọc theo ngày.
* Chạy bộ kiểm thử tự động tuần tự bằng lệnh:
  ```bash
  npx jest --runInBand
  ```

### Kiểm thử Thủ công (Manual Verification)
* Giả lập vai trò hộ lý tạo phiếu yêu cầu đồ vải vào buổi chiều (để hệ thống tự động gán ngày giao mục tiêu là ngày mai).
* Đăng nhập vai trò nhà giặt, kiểm tra xem phiếu có xuất hiện khi chọn ngày mai và ẩn khi chọn ngày hôm nay.
* Nhấn "Đã chuẩn bị xong" và kiểm tra phiếu biến mất khỏi tab "Danh sách cần chuẩn bị" và xuất hiện bên tab "Danh sách sẵn sàng" của ngày đó.
* Nhấn "Xác nhận bàn giao" trên tab "Danh sách sẵn sàng" và kiểm tra phiếu biến mất khỏi giao diện nhà giặt.
* Đăng nhập vai trò Admin/Supervisor, kiểm tra thống kê và nhật ký trạng thái hiển thị đúng quá trình chuyển đổi.
