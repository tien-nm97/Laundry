# Quản lý tài khoản và Phân quyền Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm mục tạo user và phân quyền tùy chỉnh (fine-grained permissions) trực tiếp trên trang giao diện quản trị viên `/admin` và bảo mật toàn bộ các API tương ứng.

**Architecture:** Cập nhật DB schema thêm mảng `permissions String[]` cho User. Mã hóa danh sách quyền vào JWT payload. Xây dựng API `/api/admin/users` hỗ trợ CRUD tài khoản. Sắp xếp lại giao diện `/admin` thành lưới 2x2 để hiển thị thêm bảng điều khiển Quản lý tài khoản với các modal thiết lập mật khẩu mới và chỉnh sửa quyền.

**Tech Stack:** Next.js (App Router), Prisma (PostgreSQL), bcryptjs, jose, Tailwind CSS, Jest.

---

## Các tệp sẽ thay đổi/tạo mới (Files to modify/create)
*   **Modify:**
    *   [prisma/schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma)
    *   [prisma/seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts)
    *   [src/lib/jwt.ts](file:///d:/OneDrive/desktop/Laundry/src/lib/jwt.ts)
    *   [src/app/api/admin/linen-types/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/linen-types/route.ts)
    *   [src/app/api/admin/wards/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/wards/route.ts)
    *   [src/app/api/admin/orderlies/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/orderlies/route.ts)
    *   [src/app/api/admin/batches/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/batches/route.ts)
    *   [src/app/api/admin/tickets/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/tickets/route.ts)
    *   [src/app/admin/page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)
*   **Create:**
    *   [src/app/api/admin/users/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/users/route.ts)
    *   [src/__tests__/users-api.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/users-api.test.ts)

---

### Task 1: Cập nhật Cấu trúc Database & Seeding

**Files:**
*   Modify: [prisma/schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma)
*   Modify: [prisma/seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts)

- [ ] **Step 1: Cập nhật schema.prisma**
    *   Thêm trường `permissions String[] @default([])` vào model `User` trong [prisma/schema.prisma](file:///d:/OneDrive/desktop/Laundry/prisma/schema.prisma):
    ```prisma
    model User {
      id           String   @id @default(uuid())
      username     String   @unique
      passwordHash String
      role         Role     @default(LAUNDRY)
      permissions  String[] @default([])
      createdAt    DateTime @default(now())
    }
    ```

- [ ] **Step 2: Đẩy thay đổi schema lên Database**
    *   Run: `npx prisma db push`
    *   Expected: Prisma Client generated successfully, database synchronized.

- [ ] **Step 3: Cập nhật seed.ts**
    *   Cập nhật [prisma/seed.ts](file:///d:/OneDrive/desktop/Laundry/prisma/seed.ts) để gán đầy đủ các quyền mặc định cho tài khoản admin và laundry:
    ```typescript
    // prisma/seed.ts sửa phần Seed Users:
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: {
        permissions: [
          'admin:view',
          'admin:linen',
          'admin:ward',
          'admin:staff',
          'admin:batch',
          'admin:ticket',
          'admin:users',
          'laundry:view'
        ]
      },
      create: {
        username: 'admin',
        passwordHash,
        role: 'ADMIN',
        permissions: [
          'admin:view',
          'admin:linen',
          'admin:ward',
          'admin:staff',
          'admin:batch',
          'admin:ticket',
          'admin:users',
          'laundry:view'
        ],
      },
    });

    await prisma.user.upsert({
      where: { username: 'laundry' },
      update: {
        permissions: ['laundry:view']
      },
      create: {
        username: 'laundry',
        passwordHash,
        role: 'LAUNDRY',
        permissions: ['laundry:view'],
      },
    });
    ```

- [ ] **Step 4: Chạy database seeding**
    *   Run: `cmd /c "npx prisma db seed"` (hoặc chạy qua ts-node trực tiếp: `npx prisma db seed`)
    *   Expected: "Database seeding finished successfully."

- [ ] **Step 5: Commit**
    *   Run: `git add prisma/schema.prisma prisma/seed.ts; git commit -m "feat: add permissions field to User model and update seed file"`
    *   Expected: Commit thành công.

---

### Task 2: Cập nhật Thư viện JWT & Thêm hàm Kiểm tra Quyền

**Files:**
*   Modify: [src/lib/jwt.ts](file:///d:/OneDrive/desktop/Laundry/src/lib/jwt.ts)
*   Modify: [src/app/api/auth/login/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/auth/login/route.ts)
*   Test: [src/__tests__/auth.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/auth.test.ts)

- [ ] **Step 1: Cập nhật kiểu JWT payload và hàm verifyPermission**
    *   Sửa đổi [src/lib/jwt.ts](file:///d:/OneDrive/desktop/Laundry/src/lib/jwt.ts):
    ```typescript
    export interface UserJWTPayload {
      userId: string
      username: string
      role: 'ADMIN' | 'LAUNDRY'
      permissions?: string[] // Thêm trường permissions tùy chọn
    }
    ```
    *   Thêm hàm `verifyPermission(request: Request, permission: string)` ở cuối tệp:
    ```typescript
    export async function verifyPermission(request: Request, permission: string) {
      const cookieHeader = request.headers.get('cookie') || ''
      let token: string | undefined = undefined
      const cookieList = cookieHeader.split(';')
      for (const cookie of cookieList) {
        const [name, val] = cookie.trim().split('=')
        if (name === 'token') {
          token = val
          break
        }
      }

      if (!token) {
        return { error: 'Chưa đăng nhập', status: 401 }
      }

      const payload = await verifyToken(token)
      if (!payload) {
        return { error: 'Phiên làm việc hết hạn hoặc không hợp lệ', status: 401 }
      }

      // Hỗ trợ kiểm tra quyền: Nếu có quyền cụ thể, hoặc nếu role là ADMIN và yêu cầu là xem/thao tác (ngoại trừ quản trị users cần có quyền admin:users rõ ràng)
      const userPerms = payload.permissions || []
      
      // Tài khoản ADMIN mặc định có tất cả quyền nếu không có trường permissions
      if (payload.role === 'ADMIN' && userPerms.length === 0) {
        return { payload }
      }

      if (!userPerms.includes(permission)) {
        return { error: 'Không có quyền thực hiện thao tác này', status: 403 }
      }

      return { payload }
    }
    ```

- [ ] **Step 2: Trả về permissions khi đăng nhập**
    *   Sửa đổi [src/app/api/auth/login/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/auth/login/route.ts) để đưa permissions vào JWT Token:
    ```typescript
    // Thay thế đoạn tạo token từ line 37-41:
    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions, // Thêm permissions
    })

    const response = NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions, // Thêm permissions
    })
    ```

- [ ] **Step 3: Cập nhật và chạy kiểm thử Auth**
    *   Cập nhật [src/__tests__/auth.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/auth.test.ts) để kiểm thử permissions mới.
    *   Run: `cmd /c "npx jest src/__tests__/auth.test.ts"`
    *   Expected: PASS.

- [ ] **Step 4: Commit**
    *   Run: `git add src/lib/jwt.ts src/app/api/auth/login/route.ts src/__tests__/auth.test.ts; git commit -m "feat: integrate permissions into JWT payload and add verifyPermission helper"`
    *   Expected: Commit thành công.

---

### Task 3: Xây dựng API Quản lý Tài khoản & Phân quyền

**Files:**
*   Create: [src/app/api/admin/users/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/users/route.ts)
*   Create: [src/__tests__/users-api.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/users-api.test.ts)

- [ ] **Step 1: Tạo tệp API Route quản lý users**
    *   Viết code cho [src/app/api/admin/users/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/users/route.ts):
    ```typescript
    import { prisma } from '@/lib/db'
    import { verifyPermission } from '@/lib/jwt'
    import * as bcrypt from 'bcryptjs'
    import { NextResponse } from 'next/server'

    // GET /api/admin/users: Lấy danh sách users
    export async function GET(request: Request) {
      const auth = await verifyPermission(request, 'admin:users')
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
      }

      try {
        const users = await prisma.user.findMany({
          select: {
            id: true,
            username: true,
            role: true,
            permissions: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
        return NextResponse.json(users)
      } catch (error) {
        return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 })
      }
    }

    // POST /api/admin/users: Tạo mới user
    export async function POST(request: Request) {
      const auth = await verifyPermission(request, 'admin:users')
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
      }

      try {
        const body = await request.json()
        const { username, password, role, permissions } = body

        if (!username || !password || !role) {
          return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
        }

        if (password.length < 6) {
          return NextResponse.json({ error: 'Mật khẩu phải tối thiểu 6 ký tự' }, { status: 400 })
        }

        const existing = await prisma.user.findUnique({ where: { username } })
        if (existing) {
          return NextResponse.json({ error: 'Tên đăng nhập đã tồn tại' }, { status: 400 })
        }

        const passwordHash = await bcrypt.hash(password, 10)
        const user = await prisma.user.create({
          data: {
            username,
            passwordHash,
            role,
            permissions: permissions || [],
          },
          select: {
            id: true,
            username: true,
            role: true,
            permissions: true,
            createdAt: true,
          },
        })

        return NextResponse.json(user, { status: 201 })
      } catch (error) {
        return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 })
      }
    }

    // PUT /api/admin/users: Sửa quyền hạn hoặc đổi mật khẩu
    export async function PUT(request: Request) {
      const auth = await verifyPermission(request, 'admin:users')
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
      }

      const currentUserId = auth.payload?.userId

      try {
        const body = await request.json()
        const { id, role, permissions, password } = body

        if (!id) {
          return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 })
        }

        // Ràng buộc bảo mật: Chặn tự hạ quyền admin:users hoặc thay đổi role của chính mình
        if (id === currentUserId) {
          if (role && role !== 'ADMIN') {
            return NextResponse.json({ error: 'Bạn không thể tự hạ vai trò ADMIN của mình' }, { status: 400 })
          }
          if (permissions && !permissions.includes('admin:users')) {
            return NextResponse.json({ error: 'Bạn không thể tự tước quyền quản lý tài khoản của mình' }, { status: 400 })
          }
        }

        const updateData: any = {}
        if (role) updateData.role = role
        if (permissions) updateData.permissions = permissions
        if (password) {
          if (password.length < 6) {
            return NextResponse.json({ error: 'Mật khẩu mới phải tối thiểu 6 ký tự' }, { status: 400 })
          }
          updateData.passwordHash = await bcrypt.hash(password, 10)
        }

        const updatedUser = await prisma.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            username: true,
            role: true,
            permissions: true,
            createdAt: true,
          },
        })

        return NextResponse.json(updatedUser)
      } catch (error) {
        return NextResponse.json({ error: 'Lỗi máy chủ hoặc người dùng không tồn tại' }, { status: 500 })
      }
    }

    // DELETE /api/admin/users: Xóa user
    export async function DELETE(request: Request) {
      const auth = await verifyPermission(request, 'admin:users')
      if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
      }

      const currentUserId = auth.payload?.userId

      try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
          return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 })
        }

        // Chặn tự xóa chính mình
        if (id === currentUserId) {
          return NextResponse.json({ error: 'Bạn không thể tự xóa tài khoản của chính mình' }, { status: 400 })
        }

        await prisma.user.delete({ where: { id } })
        return NextResponse.json({ success: true })
      } catch (error) {
        return NextResponse.json({ error: 'Lỗi máy chủ hoặc người dùng không tồn tại' }, { status: 500 })
      }
    }
    ```

- [ ] **Step 2: Viết test suite cho API quản lý users**
    *   Tạo file [src/__tests__/users-api.test.ts](file:///d:/OneDrive/desktop/Laundry/src/__tests__/users-api.test.ts):
    ```typescript
    /**
     * @jest-environment node
     */
    import { prisma } from '../lib/db'
    import { signToken } from '../lib/jwt'
    import { GET, POST, PUT, DELETE } from '../app/api/admin/users/route'
    import { NextRequest } from 'next/server'

    describe('Users Administration API', () => {
      let adminToken: string
      let laundryToken: string
      let testUser: any

      beforeAll(async () => {
        adminToken = await signToken({
          userId: 'admin-id-123',
          username: 'superadmin',
          role: 'ADMIN',
          permissions: ['admin:users']
        })

        laundryToken = await signToken({
          userId: 'laundry-id-123',
          username: 'laundrystaff',
          role: 'LAUNDRY',
          permissions: ['laundry:view']
        })
      })

      afterAll(async () => {
        if (testUser) {
          await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
        }
      })

      const createRequest = (method: string, body?: any, token?: string, searchParams?: string) => {
        const url = `http://localhost/api/admin/users${searchParams ? '?' + searchParams : ''}`
        const req = new NextRequest(url, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        })
        if (token) {
          req.cookies.set('token', token)
        }
        return req
      }

      it('should reject access to users list if unauthorized', async () => {
        const req = createRequest('GET', undefined, laundryToken)
        const res = await GET(req)
        expect(res.status).toBe(403)
      })

      it('should allow admin to create a new user with permissions', async () => {
        const body = {
          username: 'newtestuser',
          password: 'password123',
          role: 'LAUNDRY',
          permissions: ['laundry:view']
        }
        const req = createRequest('POST', body, adminToken)
        const res = await POST(req)
        expect(res.status).toBe(201)
        testUser = await res.json()
        expect(testUser.username).toBe('newtestuser')
        expect(testUser.permissions).toContain('laundry:view')
      })

      it('should reject creating user with duplicate username', async () => {
        const body = {
          username: 'newtestuser',
          password: 'password123',
          role: 'LAUNDRY'
        }
        const req = createRequest('POST', body, adminToken)
        const res = await POST(req)
        expect(res.status).toBe(400)
      })

      it('should reject creating user with short password', async () => {
        const body = {
          username: 'shortuser',
          password: '123',
          role: 'LAUNDRY'
        }
        const req = createRequest('POST', body, adminToken)
        const res = await POST(req)
        expect(res.status).toBe(400)
      })

      it('should allow admin to update user permissions', async () => {
        const body = {
          id: testUser.id,
          permissions: ['laundry:view', 'admin:view']
        }
        const req = createRequest('PUT', body, adminToken)
        const res = await PUT(req)
        expect(res.status).toBe(200)
        const updated = await res.json()
        expect(updated.permissions).toContain('admin:view')
      })

      it('should reject admin self-demotion of admin:users permission', async () => {
        const body = {
          id: 'admin-id-123',
          permissions: ['admin:view'] // thiếu admin:users
        }
        const req = createRequest('PUT', body, adminToken)
        const res = await PUT(req)
        expect(res.status).toBe(400)
      })

      it('should reject admin self-deletion', async () => {
        const req = createRequest('DELETE', undefined, adminToken, 'id=admin-id-123')
        const res = await DELETE(req)
        expect(res.status).toBe(400)
      })
    })
    ```

- [ ] **Step 3: Chạy test API vừa viết**
    *   Run: `cmd /c "npx jest src/__tests__/users-api.test.ts"`
    *   Expected: PASS.

- [ ] **Step 4: Commit**
    *   Run: `git add src/app/api/admin/users/route.ts src/__tests__/users-api.test.ts; git commit -m "feat: build user management API and write comprehensive unit tests"`
    *   Expected: Commit thành công.

---

### Task 4: Bảo mật Các API Admin Khác bằng Quyền Hạn Chi Tiết

**Files:**
*   Modify: [src/app/api/admin/linen-types/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/linen-types/route.ts)
*   Modify: [src/app/api/admin/wards/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/wards/route.ts)
*   Modify: [src/app/api/admin/orderlies/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/orderlies/route.ts)
*   Modify: [src/app/api/admin/batches/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/batches/route.ts)
*   Modify: [src/app/api/admin/tickets/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/tickets/route.ts)

- [ ] **Step 1: Áp dụng `verifyPermission` vào các API hiện có**
    *   *Lưu ý:* Cả các phương thức `GET`, `POST`, `PUT`, `DELETE` trong mỗi tệp cần cập nhật để kiểm tra đúng mã quyền thay vì kiểm tra quyền Admin chung.
    *   **Linen Types API ([src/app/api/admin/linen-types/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/linen-types/route.ts)):**
        *   Thay thế `verifyAdminRequest(request)` bằng `verifyPermission(request, 'admin:linen')`
    *   **Wards API ([src/app/api/admin/wards/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/wards/route.ts)):**
        *   Thay thế `verifyAdminRequest(request)` bằng `verifyPermission(request, 'admin:ward')`
    *   **Orderlies API ([src/app/api/admin/orderlies/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/orderlies/route.ts)):**
        *   Thay thế `verifyAdminRequest(request)` bằng `verifyPermission(request, 'admin:staff')`
    *   **Batches API ([src/app/api/admin/batches/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/batches/route.ts)):**
        *   Thay thế `verifyAdminRequest(request)` bằng `verifyPermission(request, 'admin:batch')`
    *   **Tickets API ([src/app/api/admin/tickets/route.ts](file:///d:/OneDrive/desktop/Laundry/src/app/api/admin/tickets/route.ts)):**
        *   Thay thế `verifyAdminRequest(request)` bằng `verifyPermission(request, 'admin:ticket')`

- [ ] **Step 2: Chạy kiểm thử toàn bộ API để chắc chắn không có lỗi**
    *   Run: `cmd /c "npx jest src/__tests__/admin-api.test.ts"` và `cmd /c "npx jest src/__tests__/orderlies-api.test.ts"`
    *   Expected: PASS.

- [ ] **Step 3: Commit**
    *   Run: `git add src/app/api/admin/; git commit -m "feat: secure all administrative API routes with fine-grained permission checks"`
    *   Expected: Commit thành công.

---

### Task 5: Xây dựng Giao diện Quản lý Tài khoản & Phân quyền trên `/admin`

**Files:**
*   Modify: [src/app/admin/page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx)

- [ ] **Step 1: Sắp xếp lại bố cục lưới sang 2x2 và thêm tab/panel tài khoản**
    *   Mở [src/app/admin/page.tsx](file:///d:/OneDrive/desktop/Laundry/src/app/admin/page.tsx).
    *   Thêm kiểu định nghĩa giao diện người dùng:
    ```typescript
    interface User {
      id: string
      username: string
      role: string
      permissions: string[]
      createdAt: string
    }
    ```
    *   Thêm các state mới cho User Management:
    ```typescript
    const [users, setUsers] = useState<User[]>([])
    const [loadingUsers, setLoadingUsers] = useState(true)
    const [submittingUser, setSubmittingUser] = useState(false)
    const [newUsername, setNewUsername] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newRole, setNewRole] = useState('LAUNDRY')
    const [newPermissions, setNewPermissions] = useState<string[]>([])

    // Trạng thái sửa đổi
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [editUserPermissions, setEditUserPermissions] = useState<string[]>([])
    const [submittingUserEdit, setSubmittingUserEdit] = useState(false)

    // Trạng thái đổi mật khẩu
    const [pwdUser, setPwdUser] = useState<User | null>(null)
    const [newPwdVal, setNewPwdVal] = useState('')
    const [submittingPwd, setSubmittingPwd] = useState(false)
    
    // Lưu tài khoản đang đăng nhập để tránh tự xóa/tự hạ quyền
    const [currentUsername, setCurrentUsername] = useState('')
    ```
    *   Thêm logic fetch users và lấy thông tin user đăng nhập ở `useEffect`:
    ```typescript
    useEffect(() => {
      fetchLinenTypes()
      fetchWards()
      fetchOrderlies()
      fetchUsers()
      setOrigin(window.location.origin)
      
      // Lấy thông tin user hiện tại từ localStorage hoặc cookie
      try {
        const localUser = localStorage.getItem('user')
        if (localUser) {
          const parsed = JSON.parse(localUser)
          setCurrentUsername(parsed.username || '')
        }
      } catch (err) {}
    }, [])

    const fetchUsers = async () => {
      setLoadingUsers(true)
      try {
        const res = await fetch('/api/admin/users')
        if (res.ok) {
          const data = await res.json()
          setUsers(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingUsers(false)
      }
    }
    ```

- [ ] **Step 2: Viết các hàm xử lý CRUD người dùng ở Frontend**
    *   **Thêm người dùng:**
    ```typescript
    const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!newUsername.trim() || !newPassword.trim() || newPassword.length < 6) {
        showFeedback('error', 'Vui lòng nhập đầy đủ và mật khẩu phải dài tối thiểu 6 ký tự')
        return
      }

      setSubmittingUser(true)
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: newUsername.trim(),
            password: newPassword,
            role: newRole,
            permissions: newPermissions,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setNewUsername('')
          setNewPassword('')
          setNewPermissions([])
          showFeedback('success', `Đã tạo tài khoản: ${data.username}`)
          fetchUsers()
        } else {
          showFeedback('error', data.error || 'Lỗi khi tạo tài khoản')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmittingUser(false)
      }
    }
    ```
    *   **Cập nhật quyền hạn:**
    ```typescript
    const handleUpdatePermissions = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!editingUser) return

      setSubmittingUserEdit(true)
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingUser.id,
            permissions: editUserPermissions,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setEditingUser(null)
          showFeedback('success', `Đã cập nhật quyền cho ${data.username}`)
          fetchUsers()
        } else {
          showFeedback('error', data.error || 'Lỗi khi cập nhật quyền')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmittingUserEdit(false)
      }
    }
    ```
    *   **Thay đổi mật khẩu:**
    ```typescript
    const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!pwdUser || newPwdVal.length < 6) {
        showFeedback('error', 'Mật khẩu phải dài tối thiểu 6 ký tự')
        return
      }

      setSubmittingPwd(true)
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: pwdUser.id,
            password: newPwdVal,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setPwdUser(null)
          setNewPwdVal('')
          showFeedback('success', `Đã đổi mật khẩu thành công cho ${data.username}`)
        } else {
          showFeedback('error', data.error || 'Lỗi khi đổi mật khẩu')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      } finally {
        setSubmittingPwd(false)
      }
    }
    ```
    *   **Xóa người dùng:**
    ```typescript
    const handleDeleteUser = async (id: string, username: string) => {
      if (username === currentUsername) {
        showFeedback('error', 'Bạn không thể tự xóa tài khoản của chính mình!')
        return
      }
      if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}" không?`)) return

      try {
        const res = await fetch(`/api/admin/users?id=${id}`, {
          method: 'DELETE',
        })
        if (res.ok) {
          showFeedback('success', 'Đã xóa tài khoản thành công')
          fetchUsers()
        } else {
          const data = await res.json()
          showFeedback('error', data.error || 'Lỗi khi xóa tài khoản')
        }
      } catch (err) {
        showFeedback('error', 'Lỗi kết nối')
      }
    }
    ```

- [ ] **Step 3: Thiết kế cấu trúc HTML giao diện và hiển thị các checkbox**
    *   Định nghĩa danh sách các quyền dạng mảng tĩnh để lặp checkbox:
    ```typescript
    const AVAILABLE_PERMISSIONS = [
      { key: 'admin:view', label: 'Xem trang Admin' },
      { key: 'admin:linen', label: 'Quản lý Loại vải' },
      { key: 'admin:ward', label: 'Quản lý Khoa phòng' },
      { key: 'admin:staff', label: 'Quản lý Hộ lý' },
      { key: 'admin:batch', label: 'Quản lý Lô hàng' },
      { key: 'admin:ticket', label: 'Xử lý Cấp phát' },
      { key: 'admin:users', label: 'Quản trị Tài khoản' },
      { key: 'laundry:view', label: 'Nghiệp vụ Nhà giặt' },
    ]
    ```
    *   Chuyển đổi Grid từ:
    ```html
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    ```
    sang:
    ```html
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
    ```
    *   Thêm Panel **Quản lý Tài khoản & Phân quyền** làm Panel thứ 4 vào Grid.
    *   Thêm các Modal chỉnh sửa quyền (`editingUser`) và đổi mật khẩu (`pwdUser`) ở cuối HTML layout.

- [ ] **Step 4: Chạy thử sản phẩm và kiểm tra chất lượng giao diện**
    *   Mở trình duyệt xem giao diện `/admin` có hiển thị 4 panel theo dạng lưới 2x2 hoàn hảo, responsive không.
    *   Test tạo tài khoản mới, bật checkbox phân quyền và bấm tạo. Sau đó kiểm tra xem tài khoản có hiện đúng các nhãn tag quyền không.
    *   Kiểm tra tính năng Đổi quyền, Đổi mật khẩu, Xóa để đảm bảo hoạt động trơn tru.

- [ ] **Step 5: Commit**
    *   Run: `git add src/app/admin/page.tsx; git commit -m "feat: complete UI for user accounts management and permission assignment modal"`
    *   Expected: Commit thành công.
