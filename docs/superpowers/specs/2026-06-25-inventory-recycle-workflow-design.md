# Đặc tả Thiết kế: Quy trình Đề xuất và Phê duyệt Tái chế Đồ vải

Tài liệu này mô tả thiết kế kỹ thuật cho quy trình **Đề xuất tái chế** của Giám sát và **Phê duyệt tái chế** từ Admin (bao gồm nhập số lượng vỏ gối thu hồi thực tế để hòa nhập vào kho chung).

---

## 1. Quy trình Nghiệp vụ (Business Flow)
1. **Đề xuất (Proposal):** Giám sát (hoặc Admin) thực hiện báo hỏng Drap và chọn phương thức "Tái chế". Thay vì trừ tồn kho và tạo lô vỏ gối ngay lập tức, hệ thống sẽ tạo một yêu cầu tái chế ở trạng thái **Chờ duyệt (PENDING)**.
2. **Theo dõi (Monitoring):** Cả Admin và Giám sát đều có thể xem danh sách các đề xuất tái chế kèm trạng thái thực tế.
3. **Phê duyệt (Approval):** Admin kiểm tra đề xuất, liên hệ đơn vị sửa chữa/nhà may để xác nhận số lượng Vỏ gối thu hồi được. Admin bấm duyệt đề xuất, nhập số lượng Vỏ gối thực tế. Lúc này hệ thống mới thực hiện giao dịch (Transaction):
   - Trừ số lượng ga giường (Drap) đang lưu hành.
   - Ghi nhận nhật ký báo hỏng Drap.
   - Tạo lô hàng nhập (`Batch`) mới cho loại đồ vải **Vỏ gối** với trữ lượng bằng số lượng vỏ gối Admin vừa nhập (tự động hòa nhập vào kho chung).
   - Chuyển trạng thái đề xuất thành **Đã duyệt (APPROVED)**.

---

## 2. Mô hình Dữ liệu (Database Schema)

Bổ sung enum `ProposalStatus` và model `LinenRecycleProposal` vào tệp [schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma):

```prisma
enum ProposalStatus {
  PENDING
  APPROVED
  REJECTED
}

model LinenRecycleProposal {
  id                 String           @id @default(uuid())
  linenCirculationId String
  quantity           Int              // Số lượng drap đề xuất tái chế
  status             ProposalStatus   @default(PENDING)
  recycledQuantity   Int?             // Số lượng vỏ gối thực tế thu hồi (Admin điền khi duyệt)
  proposerName       String           // Tên người đề xuất
  approverName       String?          // Tên Admin phê duyệt
  proposedAt         DateTime         @default(now())
  approvedAt         DateTime?
  circulation        LinenCirculation @relation(fields: [linenCirculationId], references: [id], onDelete: Cascade)
}
```

*Migration Command:*
```bash
npx.cmd prisma db push
```

---

## 3. Thiết kế API Backend

### 3.1 Cập nhật API GET `/api/admin/inventory`
- **Mô tả:** Trả về thêm danh sách các đề xuất tái chế (`recycleProposals`) để hiển thị trên UI.
- **Payload bổ sung:**
  ```json
  {
    "inventory": [...],
    "batches": [...],
    "activeCirculations": [...],
    "recycleProposals": [
      {
        "id": "uuid-proposal-1",
        "linenCirculationId": "uuid-circ-1",
        "quantity": 10,
        "status": "PENDING",
        "recycledQuantity": null,
        "proposerName": "supervisor_laundry",
        "proposedAt": "2026-06-25T08:00:00.000Z",
        "circulation": {
          "linenType": { "name": "Ga giường 1.6m" },
          "batch": { "code": "BATCH-20260601" }
        }
      }
    ]
  }
  ```

### 3.2 API Đề xuất tái chế mới `POST /api/admin/inventory/recycle/propose`
- **Phương thức:** `POST`
- **Phân quyền:** Vai trò `ADMIN` hoặc `SUPERVISOR` hoặc có quyền `supervisor:laundry_damage` / `admin:batch`.
- **Yêu cầu Body:**
  ```json
  {
    "linenCirculationId": "uuid-circulation-id",
    "quantity": 10
  }
  ```
- **Nghiệp vụ:** Tạo mới bản ghi `LinenRecycleProposal` với trạng thái `PENDING`, lưu tên người đề xuất lấy từ token JWT.

### 3.3 API Phê duyệt/Từ chối đề xuất `POST /api/admin/inventory/recycle/approve`
- **Phương thức:** `POST`
- **Phân quyền:** Chỉ `ADMIN` mới được phép thao tác.
- **Yêu cầu Body:**
  ```json
  {
    "proposalId": "uuid-proposal-id",
    "action": "APPROVED" | "REJECTED",
    "recycledQuantity": 20 // Chỉ bắt buộc khi action === "APPROVED"
  }
  ```
- **Nghiệp vụ khi APPROVED (Transaction):**
  1. Tìm bản ghi đề xuất. Kiểm tra xem số lượng Drap lưu hành tại thời điểm duyệt có còn đủ để trừ hay không (phòng trường hợp có thay đổi trong thời gian chờ duyệt).
  2. Cập nhật giảm `activeQuantity` và tăng `discardedQuantity` của lô lưu hành Drap tương ứng.
  3. Tạo bản ghi `LinenDiscardLog` ghi nhận sự kiện báo hỏng tái chế.
  4. Tự động tạo một `Batch` mới cho loại đồ vải **Vỏ gối** (tìm hoặc tạo loại đồ vải Vỏ gối nếu chưa có) với trữ lượng bằng `recycledQuantity` và mã lô dạng `RECYCLE-YYYYMMDD`.
  5. Cập nhật trạng thái đề xuất thành `APPROVED`, lưu ngày duyệt và tên người duyệt.
- **Nghiệp vụ khi REJECTED:**
  - Cập nhật trạng thái đề xuất thành `REJECTED`, lưu tên người duyệt và ngày duyệt.

---

## 4. Thiết kế Giao diện UI (`src/app/admin/inventory/page.tsx`)

### 4.1 Nút bấm & Form Báo hỏng/Tái chế:
- Khi người dùng bấm **"⚠ Báo hỏng & Tái chế"** và chọn một lô Ga giường/Drap:
  - Hiển thị 2 tùy chọn hình thức:
    - **"Thanh lý thông thường"**: Nút submit hiển thị là **"Xác nhận báo hỏng"**. Khi submit, gọi thẳng API `POST /api/admin/inventory/recycle` (xử lý trừ tồn ngay lập tức).
    - **"Đề xuất tái chế thành vỏ gối"**: Ẩn ô nhập số lượng vỏ gối thu hồi. Nút submit hiển thị là **"Gửi đề xuất tái chế"**. Khi submit, gọi API `POST /api/admin/inventory/recycle/propose`.

### 4.2 Bảng danh sách đề xuất tái chế:
- Thêm một bảng **"Yêu cầu tái chế đồ vải"** đặt ở dưới bảng thống kê kho.
- Các cột: *Tên loại vải đề xuất*, *Lô gốc*, *SL đề xuất*, *Người đề xuất*, *Thời gian*, *Trạng thái*.
- **Hành động (Chỉ hiển thị cho vai trò `ADMIN`):**
  - Nếu trạng thái là `PENDING`, hiển thị 2 nút: **"Duyệt"** (màu xanh dương) và **"Từ chối"** (màu đỏ).
  - Khi bấm **"Duyệt"**, hiển thị một Modal phụ nhỏ yêu cầu Admin: *"Nhập số lượng vỏ gối thu hồi thực tế để hòa nhập vào kho chung"*. Admin nhập số lượng và xác nhận để gọi API duyệt.
  - Khi bấm **"Từ chối"**, hiển thị hộp thoại xác nhận để gọi API từ chối.
- **Tài khoản `SUPERVISOR`:** Chỉ nhìn thấy bảng thông tin và nhãn trạng thái (Ví dụ: `Chờ duyệt` màu vàng, `Đã duyệt` màu xanh lá, `Bị từ chối` màu xám), các nút hành động sẽ bị ẩn hoàn toàn.

---

## 5. Kế hoạch Kiểm thử (Verification Plan)

### 5.1 Unit Tests
- Sửa đổi và viết bổ sung test case trong `src/__tests__/inventory.test.ts`:
  - `POST /api/admin/inventory/recycle/propose`: Supervisor gộp đề xuất thành công.
  - `POST /api/admin/inventory/recycle/approve` (APPROVED): Admin duyệt thành công, kiểm tra tồn kho Drap giảm, sinh ra lô Vỏ gối mới với số lượng chính xác.
  - `POST /api/admin/inventory/recycle/approve` (REJECTED): Admin từ chối thành công, trạng thái đề xuất cập nhật thành `REJECTED`, tồn kho Drap không thay đổi.
  - Kiểm tra phân quyền: Supervisor cố tình gọi API phê duyệt sẽ bị trả về lỗi `403`.

### 5.2 Kiểm thử Thủ công (Manual UI Verification)
- Sử dụng tài khoản `supervisor_laundry` để gửi đề xuất tái chế 10 tấm ga giường.
- Xác nhận số lượng ga giường đang lưu hành chưa bị thay đổi ngay lập tức.
- Đăng nhập bằng `admin`, kiểm tra bảng đề xuất hiện yêu cầu mới ở trạng thái Chờ duyệt.
- Bấm duyệt yêu cầu, nhập số lượng 18 vỏ gối thu hồi.
- Xác nhận số lượng ga giường lưu hành đã bị giảm 10 tấm, đồng thời xuất hiện một lô Vỏ gối mới với trữ lượng 18 cái trong lịch sử nhập hàng.
