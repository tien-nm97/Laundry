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
    const batches = await prisma.batch.findMany({
      include: {
        linenType: true,
      },
      orderBy: { importedAt: 'desc' },
    })
    return NextResponse.json(batches)
  } catch (error: any) {
    console.error('GET batches error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách lô nhập hàng' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { code, linenTypeId, totalQuantity, importedAt } = body

    if (!code || !linenTypeId || totalQuantity === undefined || !importedAt) {
      return NextResponse.json(
        { error: 'Thiếu thông tin bắt buộc (mã lô, loại vải, số lượng, ngày nhập)' },
        { status: 400 }
      )
    }

    if (totalQuantity <= 0) {
      return NextResponse.json(
        { error: 'Số lượng phải lớn hơn 0' },
        { status: 400 }
      )
    }

    // Check unique batch code
    const existing = await prisma.batch.findUnique({
      where: { code },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Mã lô nhập này đã tồn tại' },
        { status: 400 }
      )
    }

    // Check if linenType exists
    const linenType = await prisma.linenType.findUnique({
      where: { id: linenTypeId },
    })
    if (!linenType) {
      return NextResponse.json(
        { error: 'Loại vải không tồn tại' },
        { status: 400 }
      )
    }

    const newBatch = await prisma.batch.create({
      data: {
        code,
        linenTypeId,
        totalQuantity: Number(totalQuantity),
        remainingQuantity: Number(totalQuantity), // Initially equal to total
        importedAt: new Date(importedAt),
      },
      include: {
        linenType: true,
      },
    })

    return NextResponse.json(newBatch, { status: 201 })
  } catch (error: any) {
    console.error('POST batches error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo lô nhập hàng' }, { status: 500 })
  }
}
