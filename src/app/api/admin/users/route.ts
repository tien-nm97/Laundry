import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { migratePermissions } from '@/lib/permissions'
import * as bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

// GET /api/admin/users: Lấy danh sách users
export async function GET(request: Request) {
  const auth = await verifyPermission(request, 'users:view')
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

    const migratedUsers = []
    for (const u of users) {
      const migrated = migratePermissions(u.permissions)
      const isChanged = u.permissions.length !== migrated.length || 
                        u.permissions.some(p => !migrated.includes(p))
      if (isChanged) {
        await prisma.user.update({
          where: { id: u.id },
          data: { permissions: migrated }
        })
        u.permissions = migrated
      }
      migratedUsers.push(u)
    }

    return NextResponse.json(migratedUsers)
  } catch (error) {
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 })
  }
}

// POST /api/admin/users: Tạo mới user
export async function POST(request: Request) {
  const auth = await verifyPermission(request, 'users:manage')
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
        permissions: migratePermissions(permissions || []),
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
  const auth = await verifyPermission(request, 'users:manage')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const currentUserId = auth.payload?.userId

  try {
    const body = await request.json()
    const { id, username, role, permissions, password } = body

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID người dùng' }, { status: 400 })
    }

    // Ràng buộc bảo mật: Chặn tự hạ quyền admin:users hoặc thay đổi role của chính mình
    if (id === currentUserId) {
      if (role && role !== 'ADMIN') {
        return NextResponse.json({ error: 'Bạn không thể tự hạ vai trò ADMIN của mình' }, { status: 400 })
      }
      if (permissions && !permissions.includes('users:manage') && !permissions.includes('admin:users')) {
        return NextResponse.json({ error: 'Bạn không thể tự tước quyền quản lý tài khoản của mình' }, { status: 400 })
      }
    }

    const updateData: any = {}
    if (username) {
      const trimmedUsername = username.trim()
      if (!trimmedUsername) {
        return NextResponse.json({ error: 'Tên đăng nhập không được để trống' }, { status: 400 })
      }
      
      const existing = await prisma.user.findFirst({
        where: {
          username: trimmedUsername,
          NOT: { id }
        }
      })
      if (existing) {
        return NextResponse.json({ error: 'Tên đăng nhập đã tồn tại' }, { status: 400 })
      }
      updateData.username = trimmedUsername
    }
    if (role) updateData.role = role
    if (permissions) updateData.permissions = migratePermissions(permissions)
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
  const auth = await verifyPermission(request, 'users:manage')
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
