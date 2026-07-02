# Phân tách Quyền hạn Kho đồ vải (inventory:manage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai phân tách quyền can thiệp kho `inventory:manage` thành 4 quyền nghiệp vụ riêng biệt (`inventory:import`, `inventory:circulate`, `inventory:discard`, `inventory:min_stock`), loại bỏ hoàn toàn cơ chế tương thích ngược (Phương án B) và cập nhật API, UI cũng như Seed/Tests tương ứng.

**Architecture:** 
1. Cấu hình lại nhóm quyền `inventory` trong `permissions.ts` và loại bỏ ánh xạ tự động trong `hasPermission`.
2. Cập nhật các API route liên quan đến kho để kiểm tra chính xác quyền con mới.
3. Thay đổi giao diện Quản lý Kho đồ vải để hiển thị các nút chức năng động theo quyền nghiệp vụ mới.
4. Cập nhật tệp Seed dữ liệu và tệp Unit Test để ký mã token với các quyền mới tương ứng.

**Tech Stack:** Next.js (App Router), Prisma, Jest, TypeScript

---

### Task 1: Cập nhật `src/lib/permissions.ts`

**Files:**
- Modify: [permissions.ts](file:///d:/OneDrive/desktop/Laundry/src/lib/permissions.ts)

- [ ] **Step 1: Thay đổi khai báo nhóm quyền và loại bỏ ánh xạ cũ**

Sửa đổi tệp `permissions.ts` để thay thế `inventory:manage` bằng 4 quyền nghiệp vụ mới trong `PERMISSION_GROUPS`, đồng thời xóa bỏ các ánh xạ ngược từ `admin:batch`, `supervisor:laundry_damage`, `inventory:min_stock`, `supervisor:laundry_procure`, `inventory:view_stock` về `inventory:manage`/`inventory:view` trong hàm `hasPermission`.

```typescript
// Replacement content for permissions.ts (Trích đoạn nhóm inventory và hasPermission):
  {
    key: 'inventory',
    label: 'Quản lý Kho đồ vải',
    parentKey: 'inventory:all',
    parentLabel: 'Toàn quyền Quản lý Kho',
    children: [
      { key: 'inventory:view', label: 'Xem số liệu tồn kho & biến động' },
      { key: 'inventory:import', label: 'Nhập lô hàng mới' },
      { key: 'inventory:circulate', label: 'Đưa đồ vải sạch vào sử dụng' },
      { key: 'inventory:discard', label: 'Báo hỏng đồ vải / đề xuất tái chế' },
      { key: 'inventory:min_stock', label: 'Sửa định mức tồn tối thiểu' },
    ]
  }

export function hasPermission(userPerms: string[], requiredPerm: string): boolean {
  if (!userPerms || !Array.isArray(userPerms)) return false
  if (userPerms.includes(requiredPerm)) return true
  
  // If user has 'system:all', allow everything
  if (userPerms.includes('system:all')) return true

  // Backwards compatibility mappings for older permission keys
  if (userPerms.includes('admin:users') && (requiredPerm === 'users:view' || requiredPerm === 'users:manage')) return true
  if (userPerms.includes('admin:linen') && (requiredPerm === 'linen:view' || requiredPerm === 'linen:manage')) return true
  if (userPerms.includes('admin:ward') && (requiredPerm === 'ward:view' || requiredPerm === 'ward:manage')) return true
  if (userPerms.includes('admin:staff') && (requiredPerm === 'staff:view' || requiredPerm === 'staff:manage')) return true
  
  if (requiredPerm === 'laundry:view' && userPerms.includes('laundry:view')) return true
  if (requiredPerm === 'laundry:manage' && userPerms.includes('laundry:all')) return true
  
  // Find group containing this required permission
  const group = PERMISSION_GROUPS.find(g => 
    g.children.some(child => child.key === requiredPerm)
  )
  
  // If user has the parent permission of the group, return true
  if (group && userPerms.includes(group.parentKey)) {
    return true
  }
  
  return false
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat: split inventory permissions and remove backwards compatibility mappings"
```

---

### Task 2: Cập nhật các API Routes quản trị kho

**Files:**
- Modify: [circulate/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/inventory/circulate/route.ts)
- Modify: [min-stock/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/inventory/min-stock/route.ts)
- Modify: [recycle/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/inventory/recycle/route.ts)
- Modify: [propose/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/inventory/recycle/propose/route.ts)

- [ ] **Step 1: Cập nhật route circulate**

Sửa đổi quyền kiểm tra trong tệp `src/app/api/admin/inventory/circulate/route.ts` thành `inventory:circulate`:

```typescript
// Sửa tại đầu hàm POST:
export async function POST(request: Request) {
  // Verify permissions: inventory:circulate
  const auth = await verifyPermission(request, 'inventory:circulate')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const payload = auth.payload!
```

- [ ] **Step 2: Cập nhật route min-stock**

Sửa đổi quyền kiểm tra trong tệp `src/app/api/admin/inventory/min-stock/route.ts` thành `inventory:min_stock`:

```typescript
// Sửa tại đầu hàm PUT:
  const userPerms = payload.permissions || []
  const hasPerm =
    payload.role === 'ADMIN' ||
    hasPermission(userPerms, 'inventory:min_stock')

  if (!hasPerm) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }
```

- [ ] **Step 3: Cập nhật route recycle**

Sửa đổi quyền kiểm tra trong tệp `src/app/api/admin/inventory/recycle/route.ts` thành `inventory:discard`:

```typescript
// Sửa tại đầu hàm POST:
  const userPerms = payload.permissions || []
  const hasPerm =
    payload.role === 'ADMIN' ||
    hasPermission(userPerms, 'inventory:discard')
    
  if (!hasPerm) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }
```

- [ ] **Step 4: Cập nhật route propose**

Sửa đổi quyền kiểm tra trong tệp `src/app/api/admin/inventory/recycle/propose/route.ts` thành `inventory:discard`:

```typescript
// Sửa tại đầu hàm POST:
  const userPerms = payload.permissions || []
  const hasPerm =
    payload.role === 'ADMIN' ||
    hasPermission(userPerms, 'inventory:discard')

  if (!hasPerm) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/inventory/circulate/route.ts src/app/api/admin/inventory/min-stock/route.ts src/app/api/admin/inventory/recycle/route.ts src/app/api/admin/inventory/recycle/propose/route.ts
git commit -m "feat: update inventory API endpoints to enforce granular permissions"
```

---

### Task 3: Cập nhật Giao diện Quản trị Tài khoản (`src/app/admin/page.tsx`)

**Files:**
- Modify: [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)

- [ ] **Step 1: Cập nhật danh sách quyền và vai trò mẫu**

Cập nhật `AVAILABLE_PERMISSIONS` tĩnh và các thiết lập quyền mặc định khi chọn vai trò trong biểu mẫu tạo/sửa tài khoản:

```typescript
// AVAILABLE_PERMISSIONS:
const AVAILABLE_PERMISSIONS = [
  // Nhóm 1: Quản trị Hệ thống & Người dùng
  { key: 'system:all', label: 'Toàn quyền Quản trị Hệ thống' },
  { key: 'admin:view', label: 'Xem trang Admin Dashboard' },
  { key: 'users:view', label: 'Xem danh sách Tài khoản' },
  { key: 'users:manage', label: 'Can thiệp Tài khoản (Thêm/Sửa/Xóa)' },

  // Nhóm 2: Danh mục Cấu hình
  { key: 'metadata:all', label: 'Toàn quyền Cấu hình Danh mục' },
  { key: 'linen:view', label: 'Xem danh sách Loại vải' },
  { key: 'linen:manage', label: 'Can thiệp Loại vải (Thêm mới)' },
  { key: 'ward:view', label: 'Xem danh sách Khoa phòng' },
  { key: 'ward:manage', label: 'Can thiệp Khoa phòng (Thêm/QR)' },
  { key: 'staff:view', label: 'Xem danh sách Hộ lý' },
  { key: 'staff:manage', label: 'Can thiệp Hộ lý (Thêm/Sửa/Xóa)' },

  // Nhóm 3: Quản lý Kho đồ vải
  { key: 'inventory:all', label: 'Toàn quyền Quản lý Kho' },
  { key: 'inventory:view', label: 'Xem số liệu tồn kho & biến động' },
  { key: 'inventory:import', label: 'Nhập lô hàng mới' },
  { key: 'inventory:circulate', label: 'Đưa đồ vải sạch vào sử dụng' },
  { key: 'inventory:discard', label: 'Báo hỏng đồ vải / đề xuất tái chế' },
  { key: 'inventory:min_stock', label: 'Sửa định mức tồn tối thiểu' },
  ...
]

// default permissions for ADMIN role selection:
['system:all', 'admin:view', 'users:view', 'users:manage', 'linen:view', 'linen:manage', 'ward:view', 'ward:manage', 'staff:view', 'staff:manage', 'inventory:all', 'inventory:view', 'inventory:import', 'inventory:circulate', 'inventory:discard', 'inventory:min_stock', 'dispatch:all', 'dispatch:view', 'dispatch:manage', 'laundry:all', 'laundry:view', 'laundry:manage']
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "ui: update AVAILABLE_PERMISSIONS and role defaults in admin accounts manager"
```

---

### Task 4: Cập nhật Giao diện Dashboard Kho (`src/app/admin/inventory/page.tsx`)

**Files:**
- Modify: [page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/inventory/page.tsx)

- [ ] **Step 1: Khai báo các quyền hạn cụ thể**

Cập nhật các biến quyền ở đầu Component và các nút bấm giao diện:

```typescript
// Đầu component (Sau userPermissions):
  const canViewStockNumbers = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:view')
  const canImportInventory = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:import')
  const canCirculateInventory = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:circulate')
  const canDiscardInventory = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:discard')
  const canMinStockInventory = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:min_stock')
```

- [ ] **Step 2: Cập nhật điều kiện hiển thị các nút thao tác**

Thay thế các kiểm tra `inventory:manage` cũ:
- Nút "Nhập lô hàng mới" -> `canImportInventory`
- Nút "Báo hỏng & Tái chế" -> `canDiscardInventory`
- Nút "Đưa vào sử dụng" -> `canCirculateInventory`
- Nút "Chỉnh sửa định mức tồn tối thiểu" -> `canMinStockInventory`
- Quyền chọn "Tái chế thành Vỏ gối" -> `canDiscardInventory`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/inventory/page.tsx
git commit -m "ui: implement dynamic display for granular inventory action items"
```

---

### Task 5: Cập nhật Dữ liệu Mẫu (`prisma/seed.ts`)

**Files:**
- Modify: [seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts)

- [ ] **Step 1: Cập nhật seed tài khoản admin và supervisor_laundry**

Thay thế `inventory:all` bằng các quyền con mới của `admin`, và gán quyền thích hợp cho `supervisor_laundry`:

```typescript
// Tài khoản admin:
      permissions: [
        'system:all',
        'admin:view',
        'users:view',
        'users:manage',
        'linen:view',
        'linen:manage',
        'ward:view',
        'ward:manage',
        'staff:view',
        'staff:manage',
        'inventory:all',
        'inventory:view',
        'inventory:import',
        'inventory:circulate',
        'inventory:discard',
        'inventory:min_stock',
        'dispatch:all',
        'dispatch:view',
        'dispatch:manage',
        'laundry:all',
        'laundry:view',
        'laundry:manage'
      ]

// Tài khoản supervisor_laundry:
      permissions: ['admin:view', 'inventory:import', 'inventory:discard', 'inventory:min_stock', 'inventory:circulate', 'inventory:view', 'dispatch:view']
```

- [ ] **Step 2: Thực thi seed lại cơ sở dữ liệu**

Chạy lệnh: `powershell -ExecutionPolicy Bypass -Command "npx prisma db seed"`
Xác nhận: Output thông báo "Database seeding finished successfully".

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "db: update seed configurations for split inventory permissions"
```

---

### Task 6: Cập nhật tệp Unit Test và Kiểm thử Xác nhận

**Files:**
- Modify: [inventory.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/inventory.test.ts)

- [ ] **Step 1: Cập nhật các quyền của Token giả lập trong test**

Cập nhật `laundrySupervisorToken` trong tệp `src/__tests__/inventory.test.ts` để gán chính xác các quyền mới vì cơ chế tương thích ngược (Phương án B) đã bị loại bỏ:

```typescript
// Sửa đổi trong beforeAll của inventory.test.ts:
    laundrySupervisorToken = await signToken({
      userId: '4',
      username: 'laundry_supervisor',
      role: 'SUPERVISOR',
      permissions: ['admin:view', 'inventory:discard', 'inventory:import', 'inventory:min_stock', 'inventory:circulate', 'inventory:view']
    })
```

- [ ] **Step 2: Chạy kiểm thử tự động**

Chạy lệnh: `powershell -ExecutionPolicy Bypass -Command "npm run test -- --runInBand"`
Expected: Tất cả 15/15 test suites `PASS`.

- [ ] **Step 3: Biên dịch kiểm tra**

Chạy lệnh: `powershell -ExecutionPolicy Bypass -Command "npm run build"`
Expected: Build thành công, không phát sinh lỗi TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/inventory.test.ts
git commit -m "test: align mock tokens in inventory tests with new permission keys"
```
