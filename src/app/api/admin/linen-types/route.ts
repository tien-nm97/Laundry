import { prisma } from '@/lib/db'
import { verifyAdminRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const linenTypes = await prisma.linenType.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(linenTypes)
  } catch (error: any) {
    console.error('GET linen-types error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách loại vải' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { name, unit } = body

    if (!name || !unit) {
      return NextResponse.json(
        { error: 'Tên loại vải và đơn vị tính là bắt buộc' },
        { status: 400 }
      )
    }

    // Check unique name
    const existing = await prisma.linenType.findUnique({
      where: { name },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Tên loại vải này đã tồn tại' },
        { status: 400 }
      )
    }

    const newLinenType = await prisma.linenType.create({
      data: { name, unit },
    })

    return NextResponse.json(newLinenType, { status: 201 })
  } catch (error: any) {
    console.error('POST linen-types error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo loại vải mới' }, { status: 500 })
  }
}
