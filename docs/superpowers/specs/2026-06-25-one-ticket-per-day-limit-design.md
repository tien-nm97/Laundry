# Thiết kế Giới hạn 1 Phiếu Yêu cầu/Ngày và Cho phép Sửa qua Mã QR

Tài liệu này mô tả thiết kế kỹ thuật cho yêu cầu: Mỗi khoa phòng chỉ được gửi tối đa 1 phiếu yêu cầu đồ vải trong ngày. Nếu muốn bổ sung, khi quét mã QR hệ thống sẽ tự động tải lại phiếu cũ của ngày hôm đó để hộ lý thực hiện chỉnh sửa (kèm cảnh báo), miễn là phiếu đó vẫn ở trạng thái chờ (`PENDING`).

---

## 1. Yêu cầu & Mục tiêu (Requirements)

*   **Giới hạn**: Mỗi khoa phòng (`Ward`) chỉ được có tối đa 1 phiếu yêu cầu (`Ticket`) trong cùng một ngày.
*   **Xác định thời gian "Trong ngày"**:
    *   Tính theo múi giờ Việt Nam (UTC+7), từ `00:00:00` đến `23:59:59` của ngày hiện tại.
*   **Trường hợp chưa có phiếu trong ngày**:
    *   Hộ lý quét mã QR sẽ thấy form trống và điền thông tin tạo mới như bình thường.
*   **Trường hợp đã có phiếu trong ngày và trạng thái phiếu là `PENDING`**:
    *   Hệ thống tải dữ liệu phiếu cũ lên form (tên hộ lý, danh sách đồ vải và số lượng tương ứng).
    *   Hiển thị thông báo cảnh báo ngắn gọn ở đầu form: **"Khoa đã gửi yêu cầu đồ vải, bạn muốn điều chỉnh?"**
    *   Khi hộ lý chỉnh sửa và nhấn nút gửi, hệ thống sẽ thực hiện cập nhật (update) lại phiếu cũ (ghi đè dữ liệu) thay vì tạo mới.
*   **Trường hợp đã có phiếu trong ngày và trạng thái phiếu KHÁC `PENDING`** (đã chuẩn bị hoặc đã giao):
    *   Giao diện chặn không cho gửi hay sửa phiếu nữa.
    *   Hiển thị thông báo lỗi ngắn gọn: **"Phiếu hôm nay đã được xử lý, không thể sửa."**

---

## 2. Thiết kế API (`src/app/api/request/order/route.ts`)

### Ranh giới ngày (UTC+7)
Sử dụng logic tính thời điểm bắt đầu ngày của Việt Nam giống như hệ thống đang dùng:
```typescript
const now = new Date()
const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
const vnYear = vnTime.getUTCFullYear()
const vnMonth = vnTime.getUTCMonth()
const vnDay = vnTime.getUTCDate()
const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)
```

### API GET
*   Tìm kiếm phiếu yêu cầu của khoa trong ngày hôm nay:
    ```typescript
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        wardId: ward.id,
        createdAt: {
          gte: vnTodayStart
        }
      },
      include: {
        items: {
          include: {
            linenType: true
          }
        }
      }
    })
    ```
*   **Xử lý logic**:
    *   Nếu **không tìm thấy** `existingTicket`: Trả về dữ liệu danh mục bình thường (không có `existingTicket`).
    *   Nếu **tìm thấy** `existingTicket`:
        *   Nếu `existingTicket.status === 'PENDING'`: Trả về thông tin phiếu cũ trong thuộc tính `existingTicket` cùng với danh mục đồ vải và nhân viên.
        *   Nếu `existingTicket.status !== 'PENDING'`: Trả về mã lỗi `400 Bad Request` với thông điệp: `{"error": "Phiếu hôm nay đã được xử lý, không thể sửa."}`.

### API POST
*   Kiểm tra sự tồn tại của phiếu trong ngày tương tự API GET.
*   **Xử lý logic**:
    *   Nếu **không tìm thấy** phiếu trong ngày: Tiến hành tạo mới (`prisma.ticket.create`) như bình thường.
    *   Nếu **tìm thấy** phiếu và trạng thái là `PENDING`:
        *   Thực hiện cập nhật phiếu trong transaction:
            1. Cập nhật tên người yêu cầu `requesterName` ở bảng `Ticket`.
            2. Xóa toàn bộ các `TicketItem` hiện có liên kết với phiếu cũ:
               ```typescript
               await tx.ticketItem.deleteMany({
                 where: { ticketId: existingTicket.id }
               })
               ```
            3. Tạo các `TicketItem` mới từ danh sách gửi lên:
               ```typescript
               await tx.ticketItem.createMany({
                 data: items.map((item: any) => ({
                   ticketId: existingTicket.id,
                   linenTypeId: item.linenTypeId,
                   quantity: Number(item.quantity)
                 }))
               })
               ```
            4. Trả về thông tin phiếu đã được cập nhật thành công (status `200 OK` hoặc `201 Created` tương thích với giao diện).
    *   Nếu **tìm thấy** phiếu nhưng trạng thái **khác `PENDING`**: Trả về lỗi `400 Bad Request` with thông điệp: `"Phiếu hôm nay đã được xử lý, không thể sửa."`

---

## 3. Thiết kế Giao diện (`src/app/request/order/page.tsx`)

### Linh kiện Chọn đồ vải thông minh (`SearchableSelect`)
Thay thế thẻ `<select>` chọn đồ vải thông thường bằng một linh kiện tự chế `SearchableSelect` cho phép:
*   Tìm kiếm bằng cách gõ chữ:
    *   Tự động lọc danh sách đồ vải theo chữ cái bắt đầu hoặc bất kỳ cụm từ nào chứa ký tự đã gõ (không phân biệt hoa thường).
    *   Ví dụ: Nhập `d` / `D` hiển thị các loại **Drap**, nhập `đ` / `Đ` hiển thị các loại **Đồng phục**.
*   Giao diện thân thiện với thiết bị di động (nút lựa chọn lớn, dễ bấm).
*   Đóng dropdown khi click ra ngoài vùng chọn.

**Thiết kế chi tiết của `SearchableSelect`**:
```tsx
interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: LinenType[]
  placeholder: string
  required?: boolean
}

function SearchableSelect({ value, onChange, options, placeholder, required }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  const selectedOption = options.find(opt => opt.id === value)
  
  useEffect(() => {
    if (selectedOption) {
      setSearchTerm(selectedOption.name)
    } else {
      setSearchTerm('')
    }
  }, [value, selectedOption])

  const filteredOptions = options.filter(opt => {
    if (!searchTerm || selectedOption?.name === searchTerm) return true
    const query = searchTerm.toLowerCase().trim()
    const nameLower = opt.name.toLowerCase()
    
    // Khớp ký tự đầu tiên của từ hoặc cả chuỗi
    if (nameLower.startsWith(query)) return true
    const words = nameLower.split(/\s+/)
    if (words.some(w => w.startsWith(query))) return true
    
    return nameLower.includes(query)
  })

  // Đóng khi click ngoài
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.searchable-select-container')) {
        setIsOpen(false)
        setSearchTerm(selectedOption ? selectedOption.name : '')
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isOpen, selectedOption])
  
  // Render input tìm kiếm kèm danh sách gợi ý lọc động...
}
```

### Quản lý trạng thái (State)
*   Thêm state `hasExistingTicket` (boolean) để lưu trữ việc sửa phiếu cũ.
*   Thêm state `existingTicketId` (string | null) để phục vụ cho các hiển thị và xử lý nếu cần.

### Khởi tạo dữ liệu (useEffect)
*   Khi gọi API GET `/api/request/order` thành công:
    *   Nếu có dữ liệu `existingTicket`:
        *   Đặt `requesterName` = `existingTicket.requesterName`.
        *   Đặt `rows` = danh sách mặt hàng chuyển đổi từ `existingTicket.items` thành định dạng `{ linenTypeId, quantity }`.
        *   Đặt `hasExistingTicket` = `true`.
    *   Nếu không có `existingTicket`:
        *   Giữ trạng thái form trống mặc định.

### Hiển thị Cảnh báo (UI Alert)
*   Khi `hasExistingTicket === true`, render một banner màu vàng nhạt ngay dưới tiêu đề của form:
    ```tsx
    {hasExistingTicket && (
      <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold px-3 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in">
        <svg className="w-4 h-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Khoa đã gửi yêu cầu đồ vải, bạn muốn điều chỉnh?</span>
      </div>
    )}
    ```

---

## 4. Kế hoạch Kiểm thử (Verification Plan)

### Kiểm thử Tự động (Automated Tests)
Bổ sung các test case trong `src/__tests__/request.test.ts`:
1.  **GET Validation**:
    *   Xác nhận trả về `existingTicket` và điền sẵn thông tin khi đã có phiếu `PENDING` hôm nay.
    *   Xác nhận trả về lỗi `400` với thông báo `"Phiếu hôm nay đã được xử lý, không thể sửa."` khi phiếu hôm nay đã ở trạng thái `PREPARED`.
2.  **POST Submission**:
    *   Gửi yêu cầu lần đầu -> Tạo mới thành công (trả về status `201`).
    *   Gửi yêu cầu lần hai (cập nhật) -> Cập nhật thành công phiếu cũ, số lượng các mặt hàng thay đổi chuẩn xác (trả về status `200` hoặc `201`, kiểm tra database thấy số lượng dòng `TicketItem` cập nhật và số lượng thay đổi).
    *   Gửi yêu cầu khi phiếu đã có trạng thái khác `PENDING` -> Trả về lỗi `400` và không thay đổi dữ liệu trong database.
