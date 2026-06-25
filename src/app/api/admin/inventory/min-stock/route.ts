import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function PUT(request: Request) {
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
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Phiên làm việc hết hạn hoặc không hợp lệ' }, { status: 401 })
  }

  const hasPermission = payload.role === 'ADMIN' || payload.role === 'SUPERVISOR' || (payload.permissions || []).includes('admin:batch')
  if (!hasPermission) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Dữ liệu yêu cầu không hợp lệ' }, { status: 400 })
    }

    // Execute bulk updates in a transaction
    const results = await prisma.$transaction(
      body.map((item) =>
        prisma.linenType.update({
          where: { id: item.linenTypeId },
          data: { minStock: Number(item.minStock) },
        })
      )
    )

    return NextResponse.json({ success: true, count: results.length }, { status: 200 })
  } catch (error: unknown) {
    console.error('PUT min-stock error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật định mức tồn tối thiểu'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
