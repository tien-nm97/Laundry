# Đặc tả Thiết kế: Tích hợp Module Đồ vải (Laundry) vào Hệ thống BIH Infrastructure Manager

Tài liệu này đặc tả phương án tích hợp và đóng gói phân hệ **Quản lý & Cấp phát Đồ vải (Laundry)** vào dự án gốc **BIH Infrastructure Manager** (`bih-infra-manager`).

---

## 1. Bản đồ Định cấu trúc Thư mục tích hợp (Folder Mapping)

Để khớp với cấu trúc thư mục của hệ thống **App-BIH**, phân hệ Laundry sẽ được sắp xếp và đổi tên các đường dẫn tệp tin như sau:

| Tệp tin hiện tại | Vị trí mới trong App-BIH | Nhiệm vụ |
| :--- | :--- | :--- |
| **`src/lib/permissions.ts`** | `lib/services/laundry-auth.ts` | Logic kiểm tra quyền hạn của Laundry dựa trên NextAuth session. |
| **`src/app/api/admin/inventory/...`** | `app/api/laundry/inventory/...` | Các API nghiệp vụ kho (circulate, min-stock, recycle...). |
| **`src/app/api/admin/linen-types/...`**| `app/api/laundry/linen-types/...`| API quản lý danh mục loại đồ vải. |
| **`src/app/admin/inventory/page.tsx`** | `app/dashboard/laundry/inventory/page.tsx` | Dashboard quản lý kho đồ vải (đặt trong phân khu `/dashboard`). |
| **`src/app/admin/dispatch/page.tsx`** | `app/dashboard/laundry/dispatch/page.tsx` | Giao diện điều phối cấp phát cho hộ lý khoa phòng. |
| **`src/app/laundry/page.tsx`** | `app/dashboard/laundry/operation/page.tsx` | Giao diện tiếp nhận/phân loại dành cho nhân viên nhà giặt. |
| **`src/app/request/order/page.tsx`** | `app/dashboard/laundry/request/page.tsx` | Cổng gửi yêu cầu đồ vải của Điều dưỡng khoa phòng. |

---

## 2. Thiết kế Cơ sở Dữ liệu tích hợp (Prisma Schema Migration)

Nối (merge) các model của Laundry vào tệp tin [prisma/schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma) của hệ thống chính.
Chúng ta sẽ liên kết các bảng của Laundry với model `User` sẵn có của **BIH** và sử dụng các Enum `Role` và `Rank` hiện tại của hệ thống:

```prisma
// 1. Ánh xạ liên kết vào Model User sẵn có của BIH
model User {
  id          String    @id @default(uuid())
  username    String    @unique
  role        Role      // ADMIN, NURSING, SUPPLY...
  rank        Rank      // MANAGER, LEADER, SUPERVISOR, STAFF...
  department  String?   // Khoa phòng phụ trách
  
  // Liên kết Laundry mới:
  createdProposals LinenRecycleProposal[] @relation("ProposerRelation")
  approvedProposals LinenRecycleProposal[] @relation("ApproverRelation")
}

// 2. Các Model nghiệp vụ Đồ vải (đặt trong prisma/schema.prisma gốc)
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

model Ticket {
  id             String       @id @default(uuid())
  status         String       @default("PENDING") // PENDING, APPROVED, SHIPPED, COMPLETED
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

model Ward {
  id        String   @id @default(uuid())
  name      String   @unique
  qrToken   String   @unique
  createdAt DateTime @default(now())
  tickets   Ticket[]
}
```

---

## 3. Xác thực & Phân quyền thông qua NextAuth.js

BIH Infrastructure Manager sử dụng **NextAuth.js** với JWT session. Chúng ta sẽ tích hợp các quyền của Laundry dựa vào cấu trúc **Role** và **Rank** của BIH.

### 3.1. Định nghĩa logic phân quyền Laundry trong `lib/services/laundry-auth.ts`:
Hệ thống sẽ cấp các quyền ảo (virtual permissions) cho phiên làm việc dựa trên vai trò của nhân sự:

```typescript
import { Role, Rank } from '@prisma/client'

export function getLaundryPermissions(role: Role, rank: Rank): string[] {
  // ADMIN mặc định có tất cả quyền
  if (role === 'ADMIN') {
    return ['laundry:all', 'inventory:all', 'dispatch:all']
  }

  // Tổ Vật tư (SUPPLY) phụ trách Kho và Nhà giặt
  if (role === 'SUPPLY') {
    if (rank === 'MANAGER' || rank === 'LEADER' || rank === 'SUPERVISOR') {
      return [
        'inventory:view',
        'inventory:import',
        'inventory:circulate',
        'inventory:discard',
        'inventory:min_stock',
        'laundry:view',
        'laundry:manage',
        'dispatch:view',
        'dispatch:manage'
      ]
    }
    // Nhân viên vật tư thường
    return ['inventory:view', 'laundry:view', 'laundry:manage']
  }

  // Tổ Điều dưỡng (NURSING) phụ trách yêu cầu và nhận đồ tại khoa
  if (role === 'NURSING') {
    if (rank === 'MANAGER' || rank === 'LEADER' || rank === 'SUPERVISOR') {
      return ['dispatch:view', 'dispatch:manage']
    }
    return ['dispatch:view']
  }

  return []
}

export function hasLaundryPermission(userPermissions: string[], requiredPermission: string): boolean {
  if (userPermissions.includes(requiredPermission)) return true
  
  // Kiểm tra quyền cha
  if (requiredPermission.startsWith('inventory:') && userPermissions.includes('inventory:all')) return true
  if (requiredPermission.startsWith('laundry:') && userPermissions.includes('laundry:all')) return true
  if (requiredPermission.startsWith('dispatch:') && userPermissions.includes('dispatch:all')) return true
  
  return false
}
```

### 3.2. Cập nhật NextAuth Callback (`app/api/auth/[...nextauth]/route.ts`)
Ánh xạ các quyền này vào session để cả Client-side và API-side có thể dùng trực tiếp:

```typescript
// Thêm vào callbacks của NextAuth:
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.role = user.role;
      token.rank = user.rank;
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

---

## 4. Tận dụng các hạ tầng sẵn có của BIH

### 4.1. Dịch vụ gửi Email thông báo (`lib/email.ts`)
Thay vì dùng thư viện nodemailer tự cài đặt, phân hệ Laundry sẽ gọi trực tiếp dịch vụ email sẵn có của BIH để gửi thông báo duyệt đề xuất tái chế hoặc cảnh báo tồn kho tối thiểu:

```typescript
import { sendEmail } from '@/lib/email'

await sendEmail({
  to: 'manager@bih-hospital.com',
  subject: '[Laundry Alert] Ga giường sắp hết dưới hạn mức tồn tối thiểu',
  text: 'Kho ga giường hiện tại còn 15 cái, dưới hạn mức tối thiểu là 50 cái. Vui lòng phê duyệt nhập lô mới.'
})
```

### 4.2. Lưu trữ tệp tin đính kèm (MinIO S3)
Các ảnh chụp đính kèm khi báo hỏng đồ vải rách/bẩn sẽ được upload trực tiếp lên **MinIO Object Storage** của BIH thông qua S3 client thay vì lưu cục bộ:

```typescript
import { uploadToS3 } from '@/lib/services/s3' // Giả định helper S3 của BIH

// Lưu tệp đính kèm khi báo hỏng
const fileUrl = await uploadToS3(fileBuffer, 'laundry-discards/' + fileName)
```

---

## 5. Kế hoạch triển khai & Kiểm thử (Migration Plan)

1. **Database Sync:** Copy code model mới vào `prisma/schema.prisma` và chạy `npx prisma db push`.
2. **NextAuth Update:** Bổ sung hàm ánh xạ quyền vào JWT/Session callback.
3. **Copy Modules:** Copy các thư mục UI và API tương ứng vào `/app/dashboard/laundry` và `/app/api/laundry`.
4. **CSS Alignment:** Xóa tệp `globals.css` cũ của Laundry. Đảm bảo cấu hình `tailwind.config` của BIH quét qua thư mục `app/dashboard/laundry` để compile style.
5. **Testing (Vitest):** Viết các test case Vitest mới trong thư mục `tests/` để chạy kiểm tra.
