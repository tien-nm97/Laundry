import { prisma } from '@/lib/db'
import { signToken } from '@/lib/jwt'
import { migratePermissions } from '@/lib/permissions'
import * as bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Tên đăng nhập và mật khẩu là bắt buộc' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      )
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      )
    }

    const migratedPerms = migratePermissions(user.permissions)
    const isChanged = user.permissions.length !== migratedPerms.length || 
                      user.permissions.some(p => !migratedPerms.includes(p))
    if (isChanged) {
      await prisma.user.update({
        where: { id: user.id },
        data: { permissions: migratedPerms }
      })
      user.permissions = migratedPerms
    }

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
    })

    const response = NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
    })

    // Set secure HttpOnly cookie
    response.headers.append(
      'Set-Cookie',
      `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24}`
    )

    return response
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi hệ thống' },
      { status: 500 }
    )
  }
}
