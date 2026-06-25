import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
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

  const userPerms = payload.permissions || []
  const hasPermission =
    payload.role === 'ADMIN' ||
    userPerms.includes('supervisor:laundry_damage') ||
    userPerms.includes('admin:batch')

  if (!hasPermission) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { linenCirculationId, quantity } = body

    if (!linenCirculationId || !quantity) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (Number(quantity) <= 0) {
      return NextResponse.json({ error: 'Số lượng đề xuất phải lớn hơn 0' }, { status: 400 })
    }

    // Check if the circulation batch exists
    const circulation = await prisma.linenCirculation.findUnique({
      where: { id: linenCirculationId },
      include: { linenType: true }
    })

    if (!circulation) {
      return NextResponse.json({ error: 'Lô đồ vải lưu thông không tồn tại' }, { status: 404 })
    }

    // Verify it is a Drap/Ga type for recycling
    const isDrap =
      circulation.linenType.name.toLowerCase().includes('drap') ||
      circulation.linenType.name.toLowerCase().includes('ga trải') ||
      circulation.linenType.name.toLowerCase().includes('ga giường')

    if (!isDrap) {
      return NextResponse.json({ error: 'Chỉ có thể đề xuất tái chế từ các loại Drap/Ga trải giường' }, { status: 400 })
    }

    if (circulation.activeQuantity < Number(quantity)) {
      return NextResponse.json({
        error: `Số lượng đề xuất vượt quá lượng lưu hành còn lại (${circulation.activeQuantity})`
      }, { status: 400 })
    }

    const proposal = await prisma.linenRecycleProposal.create({
      data: {
        linenCirculationId,
        quantity: Number(quantity),
        status: 'PENDING',
        proposerName: payload.username,
      }
    })

    return NextResponse.json(proposal, { status: 201 })
  } catch (error: unknown) {
    console.error('POST recycle propose error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống khi gửi đề xuất tái chế'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
