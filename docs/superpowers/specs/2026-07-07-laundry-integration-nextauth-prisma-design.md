# Đặc tả Thiết kế: Tích hợp Phân hệ Laundry vào Hệ thống Next.js sẵn có (NextAuth.js & Prisma & PostgreSQL)

Tài liệu này hướng dẫn chi tiết cách đóng gói phân hệ quản lý đồ vải (Laundry) và tích hợp vào hệ thống Next.js sẵn có của bạn sử dụng **NextAuth.js** (JWT Session), **Prisma** và **PostgreSQL**.

---

## 1. Phương án Ánh xạ Vai trò & Cấp bậc (Roles & Ranks Mapping)

Hệ thống đích sử dụng cơ chế phân quyền dựa trên Vai trò (`Role`) và Cấp chức (`Rank`). Chúng ta sẽ ánh xạ các nghiệp vụ của Laundry vào cấu trúc này như sau:

| Nghiệp vụ Laundry | Vai trò Hệ thống đích | Cấp chức yêu cầu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị hệ thống** | `ADMIN` | Mọi cấp chức | Toàn quyền kiểm soát cấu hình và tài khoản |
| **Yêu cầu cấp phát đồ vải** | `NURSING` (Điều dưỡng) | `STAFF` hoặc `SUPERVISOR` | Người tạo phiếu yêu cầu cấp ga giường/vỏ gối cho khoa |
| **Giao nhận/Hộ lý** | `NURSING` / `SUPPLY` | `STAFF` | Hộ lý vận chuyển đồ vải đi giặt/nhận đồ sạch |
| **Giám sát Kho/Nhà giặt** | `SUPPLY` (Vật tư) | `SUPERVISOR` hoặc `LEADER` | Duyệt cấp phát, báo hỏng, nhập lô hàng |
| **Nhân viên Nhà giặt** | `SUPPLY` (Vật tư) | `STAFF` | Quét nhận đồ bẩn, phân loại, giao đồ sạch |

---

## 2. Thiết kế Tích hợp Cơ sở Dữ liệu (Prisma Schema Integration)

Bổ sung các bảng nghiệp vụ của Laundry vào tệp `schema.prisma` của dự án gốc. Chúng ta sẽ liên kết bảng `User` sẵn có của bạn với các mô hình của Laundry:

```prisma
// Nối thêm trường vào Model User hiện có của hệ thống gốc
model User {
  id          String   @id @default(uuid())
  username    String   @unique
  role        Role     // Vai trò (ADMIN, NURSING, SUPPLY...)
  rank        Rank     // Cấp chức (MANAGER, SUPERVISOR, STAFF...)
  department  String?  // Phòng ban / Khoa phòng quản lý
  
  // Tích hợp thêm liên kết Laundry:
  proposals   LinenRecycleProposal[] // Các đề xuất tái chế do user này tạo/duyệt
}

// Bổ sung các Model nghiệp vụ của Laundry
model LinenType {
  id           String                 @id @default(uuid())
  name         String                 @unique
  unit         String
  minStock     Int                    @default(0)
  createdAt    DateTime               @default(now())
  batches      Batch[]
  circulations LinenCirculation[]
  ticketItems  TicketItem[]
  transactions InventoryTransaction[]

  @@map("LinenType")
}

model Batch {
  id                String             @id @default(uuid())
  code              String             @unique
  linenTypeId       String
  totalQuantity     Int
  remainingQuantity Int
  importedAt        DateTime
  createdAt         DateTime           @default(now())
  linenType         LinenType          @relation(fields: [linenTypeId], references: [id], onDelete: Cascade)
  circulations      LinenCirculation[]
}

model LinenCirculation {
  id               String                 @id @default(uuid())
  batchId          String
  linenTypeId      String
  startUseDate     DateTime
  originalQuantity Int
  activeQuantity   Int
  discardedQuantity Int                    @default(0)
  createdAt        DateTime               @default(now())
  batch            Batch                  @relation(fields: [batchId], references: [id], onDelete: Cascade)
  linenType        LinenType              @relation(fields: [linenTypeId], references: [id], onDelete: Cascade)
  discardLogs      LinenDiscardLog[]
  proposals        LinenRecycleProposal[]
}

// Hệ thống Phiếu yêu cầu cấp phát & Giao nhận đồ vải
model Ticket {
  id             String       @id @default(uuid())
  status         TicketStatus @default(PENDING) // PENDING, APPROVED, SHIPPED, COMPLETED...
  wardId         String
  requesterName  String
  createdAt      DateTime     @default(now())
  deliveryDate   DateTime?
  ward           Ward         @relation(fields: [wardId], references: [id])
  items          TicketItem[]
}

model TicketItem {
  id          String    @id @default(uuid())
  ticketId    String
  linenTypeId String
  quantity    Int
  ticket      Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  linenType   LinenType @relation(fields: [linenTypeId], references: [id], onDelete: Cascade)
}

// Các mô hình danh mục bổ sung
model Ward {
  id        String   @id @default(uuid())
  name      String   @unique
  qrToken   String   @unique
  createdAt DateTime @default(now())
  tickets   Ticket[]
}
```

---

## 3. Kiến trúc Đăng nhập & Xác thực (NextAuth.js Integration)

Thay vì sử dụng cookie JWT tự tạo, chúng ta sẽ viết lại tầng kiểm tra quyền hạn sử dụng NextAuth.js.

### 3.1. Phương án A: Tích hợp Quyền vào JWT Token (NextAuth Callback)
Bổ sung danh sách các quyền con của Laundry trực tiếp vào session của NextAuth:

```typescript
// pages/api/auth/[...nextauth].ts hoặc app/api/auth/[...nextauth]/route.ts
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.role = user.role;
      token.rank = user.rank;
      token.department = user.department;
      // Tự động phân quyền dựa trên Role & Rank của user
      token.permissions = getLaundryPermissions(user.role, user.rank);
    }
    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      session.user.role = token.role;
      session.user.rank = token.rank;
      session.user.permissions = token.permissions;
    }
    return session;
  }
}
```

### 3.2. Viết lại Middleware Auth Adapter (`src/lib/auth-bridge.ts`)
Viết một hàm tiện ích để kiểm tra quyền hạn của Session NextAuth ở các API route của Laundry:

```typescript
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'

export async function verifyLaundrySession(request: Request, requiredPermission: string) {
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user) {
    return { error: 'Chưa đăng nhập', status: 401 }
  }

  // Admin mặc định thông qua
  if (session.user.role === 'ADMIN') {
    return { payload: session.user }
  }

  const userPerms = session.user.permissions || []
  if (!userPerms.includes(requiredPermission)) {
    return { error: 'Không có quyền truy cập nghiệp vụ này', status: 403 }
  }

  return { payload: session.user }
}
```

---

## 4. Tích hợp Giao diện (UI Layout Integration)

Đưa toàn bộ giao diện Laundry vào một route con biệt lập để tránh xung đột với các trang sẵn có:

- **/admin/laundry-inventory**: Dashboard Kho đồ vải.
- **/admin/laundry-dispatch**: Quản lý cấp phát.
- **/laundry**: Giao diện nghiệp vụ cho nhân viên nhà giặt.
- **/request/laundry-order**: Giao diện gửi yêu cầu của điều dưỡng khoa phòng.

Các tệp CSS toàn cục (`globals.css`) của Laundry sẽ được loại bỏ; các component sẽ sử dụng trực tiếp cấu hình CSS/Tailwind của hệ thống đích để tự động thừa hưởng font chữ và bảng màu của dự án gốc.
