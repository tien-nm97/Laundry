import { prisma } from '@/lib/db'
import { verifyAdminRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const wards = await prisma.ward.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(wards)
  } catch (error: any) {
    console.error('GET wards error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách khoa phòng' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Tên khoa phòng là bắt buộc' },
        { status: 400 }
      )
    }

    const existing = await prisma.ward.findUnique({
      where: { name },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Tên khoa phòng này đã tồn tại' },
        { status: 400 }
      )
    }

    // Generate secure random QR token
    const qrToken = randomBytes(16).toString('hex')

    const newWard = await prisma.ward.create({
      data: {
        name,
        qrToken,
      },
    })

    return NextResponse.json(newWard, { status: 201 })
  } catch (error: any) {
    console.error('POST wards error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo khoa phòng mới' }, { status: 500 })
  }
}
