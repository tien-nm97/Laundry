# Thiết kế Giao diện Tab Quản lý Cấp phát & Thống kê Đồ vải Hằng ngày

Thiết kế tái cấu trúc trang quản lý yêu cầu cấp phát (`src/app/admin/dispatch/page.tsx`) thành giao diện 2 tab lớn: Tab Lịch Nhật ký phiếu theo Ngày và Tab Tổng hợp số lượng đồ vải yêu cầu hằng ngày.

---

## 1. Mục tiêu (Goal)
- **Tab 1: Nhật ký phiếu theo Ngày**: Giúp Giám sát/Admin theo dõi tình trạng cấp phát của từng ngày thông qua một Bộ lịch tháng trực quan đặt cạnh Danh sách phiếu chi tiết.
- **Tab 2: Tổng hợp Yêu cầu Đồ vải Hằng ngày**: Tổng hợp cộng dồn số lượng đồ vải được yêu cầu cấp phát trong ngày để phục vụ so sánh với dữ liệu giường bệnh/bệnh nhân sau này.
- **Phân quyền & Hiển thị**: Đảm bảo giao diện hoạt động mượt mà cho cả ADMIN (được phép thao tác xử lý) và SUPERVISOR (chỉ được phép xem/giám sát).

---

## 2. Chi tiết Thiết kế & Bố cục UI (UI Design & Layout)

### Tab 1: Nhật ký phiếu theo Ngày (Calendar & Tickets View)
- **Layout**: Sử dụng Grid chia 2 cột trên màn hình máy tính (hoặc xếp chồng trên di động):
  - **Cột Trái (Bộ lịch)**:
    - Hiển thị lưới lịch 7 cột (từ Thứ 2 đến Chủ nhật) của tháng hiện tại.
    - Cho phép chuyển đổi tháng trước/sau (`❮` và `❯`).
    - Mỗi ô ngày hiển thị số ngày và có các chấm màu chỉ báo trạng thái phiếu của ngày đó:
      - Chấm **Xanh lá (Emerald)**: Tất cả phiếu trong ngày đã được giao (`DELIVERED`).
      - Chấm **Vàng/Cam (Amber)**: Có phiếu đang chờ chuẩn bị hoặc sẵn sàng giao (`PENDING`, `PREPARED`).
      - Chấm **Đỏ (Rose)**: Có phiếu chưa hoàn thành hoặc bị lỗi (`INCOMPLETE`).
    - Ngày đang được chọn sẽ hiển thị viền nổi bật (Active border) hoặc nền xanh dương thương hiệu `#0066b2`.
  - **Cột Phải (Nhật ký phiếu)**:
    - Tiêu đề hiển thị ngày đang được chọn (ví dụ: *"Danh sách phiếu ngày 25/06/2026"*).
    - Bộ lọc nhanh theo Khoa phòng và Bộ lọc Trạng thái phiếu (Tất cả, Chờ soạn, Sẵn sàng, Đã giao...).
    - Bảng hiển thị danh sách phiếu chi tiết của ngày được chọn: Mã phiếu, Khoa phòng, Hộ lý, Chi tiết đồ vải, Giờ tạo, Trạng thái.

### Tab 2: Tổng hợp Yêu cầu Đồ vải Hằng ngày (Daily Aggregates View)
- **Bảng Thống kê**:
  - Mỗi dòng đại diện cho một ngày (sắp xếp giảm dần theo thời gian).
  - Các cột gồm: Ngày, Tổng số phiếu yêu cầu, Số lượng cộng dồn chi tiết của từng loại đồ vải (Mền xanh, Vỏ gối, Áo choàng...).
- **Khung thông tin bệnh nhân (Placeholder)**:
  - Một hộp thông tin đẹp mắt ở phía dưới giải thích về hướng phát triển tích hợp số liệu bệnh nhân/giường bệnh để tính toán tương quan hao hụt và định mức cấp phát tối ưu trong tương lai.

---

## 3. Kiến trúc Luồng dữ liệu & State (Data & State Architecture)

### Quản lý React State (Client-Side)
Chúng tôi sử dụng **Phương án 1 (Client-side calculation)** để gom nhóm và tổng hợp dữ liệu ngay tại trình duyệt, mang lại tốc độ phản hồi cực nhanh khi chuyển ngày và chuyển tab:
- `activeTab`: `'TICKETS' | 'AGGREGATE'` (Tab hiện tại).
- `currentMonth`: Đối tượng Date lưu tháng/năm đang xem trên lịch.
- `selectedDate`: Chuỗi ngày định dạng `YYYY-MM-DD` đại diện cho ngày đang được chọn để xem chi tiết phiếu.
- `tickets`: Danh sách toàn bộ các phiếu cấp phát tải về từ API `/api/admin/tickets`.

### Logic Gom nhóm & Xử lý (React useMemo)
1. **Lọc phiếu theo ngày được chọn (`dailyTickets`)**:
   ```typescript
   const dailyTickets = useMemo(() => {
     return tickets.filter(t => {
       const ticketDate = new Date(t.createdAt).toISOString().split('T')[0];
       return ticketDate === selectedDate;
     });
   }, [tickets, selectedDate]);
   ```

2. **Tổng hợp dữ liệu theo ngày (`dailyAggregates`)**:
   ```typescript
   const dailyAggregates = useMemo(() => {
     const aggregatesMap: Record<string, { date: string; ticketCount: number; items: Record<string, { qty: number; unit: string }> }> = {};
     
     tickets.forEach(t => {
       const dateStr = new Date(t.createdAt).toISOString().split('T')[0];
       if (!aggregatesMap[dateStr]) {
         aggregatesMap[dateStr] = { date: dateStr, ticketCount: 0, items: {} };
       }
       aggregatesMap[dateStr].ticketCount += 1;
       t.items.forEach(item => {
         const typeName = item.linenType.name;
         if (!aggregatesMap[dateStr].items[typeName]) {
           aggregatesMap[dateStr].items[typeName] = { qty: 0, unit: item.linenType.unit };
         }
         aggregatesMap[dateStr].items[typeName].qty += item.quantity;
       });
     });

     return Object.values(aggregatesMap).sort((a, b) => b.date.localeCompare(a.date));
   }, [tickets]);
   ```

3. **Bản đồ trạng thái theo ngày phục vụ Lịch (`dateStatusMap`)**:
   ```typescript
   const dateStatusMap = useMemo(() => {
     const statusMap: Record<string, 'DELIVERED' | 'PENDING' | 'INCOMPLETE'> = {};
     tickets.forEach(t => {
       const dateStr = new Date(t.createdAt).toISOString().split('T')[0];
       const currentStatus = t.status;
       
       if (!statusMap[dateStr]) {
         statusMap[dateStr] = currentStatus === 'DELIVERED' ? 'DELIVERED' : (currentStatus === 'INCOMPLETE' ? 'INCOMPLETE' : 'PENDING');
       } else {
         // Cập nhật mức độ ưu tiên chỉ báo: Đỏ (INCOMPLETE) > Cam (PENDING/PREPARED) > Xanh (DELIVERED)
         const prev = statusMap[dateStr];
         if (currentStatus === 'INCOMPLETE' || prev === 'INCOMPLETE') {
           statusMap[dateStr] = 'INCOMPLETE';
         } else if (currentStatus !== 'DELIVERED' || prev !== 'DELIVERED') {
           statusMap[dateStr] = 'PENDING';
         }
       }
     });
     return statusMap;
   }, [tickets]);
   ```

---

## 4. Kế hoạch Kiểm thử & Xác nhận (Verification Plan)

### Kiểm thử Tự động (Automated Tests)
- Viết thêm file test UI `src/__tests__/dispatch-tabs-ui.test.tsx` (hoặc mở rộng test hiện có) để kiểm nghiệm:
  - Kiểm tra tab mặc định mở ra là Tab 1.
  - Mô phỏng người dùng click chuyển đổi sang Tab 2 và xác nhận bảng tổng hợp dữ liệu đồ vải hiển thị đúng số lượng cộng dồn.
  - Mô phỏng người dùng chọn một ngày cụ thể trên Lịch và kiểm tra danh sách phiếu được lọc tương ứng.

### Kiểm thử Thủ công (Manual Verification)
1. Đăng nhập với tài khoản Admin/Supervisor và truy cập trang Cấp phát.
2. Kiểm tra bộ lịch hiển thị đầy đủ các ngày trong tháng hiện tại và có các dấu chấm màu sắc chỉ báo chính xác.
3. Thử click chọn một ngày khác có phiếu yêu cầu và xác nhận danh sách phiếu bên phải thay đổi.
4. Chuyển sang Tab "Tổng hợp Đồ vải hằng ngày", kiểm tra bảng số liệu cộng dồn xem tổng số lượng đồ vải có khớp với tổng số phiếu yêu cầu của ngày đó hay không.
