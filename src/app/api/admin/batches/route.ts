import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyPermission(request, 'admin:view')
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
  const auth = await verifyPermission(request, 'admin:batch')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { code, linenTypeId, totalQuantity, importedAt, items } = body

    // Multi-item import mode
    if (items && Array.isArray(items)) {
      if (!code || !importedAt || items.length === 0) {
        return NextResponse.json(
          { error: 'Thiếu thông tin bắt buộc (mã lô, ngày nhập, danh sách đồ vải)' },
          { status: 400 }
        )
      }

      for (const item of items) {
        const { linenTypeId, totalQuantity } = item
        if (!linenTypeId || totalQuantity === undefined || totalQuantity <= 0) {
          return NextResponse.json(
            { error: 'Thông tin loại đồ vải hoặc số lượng không hợp lệ' },
            { status: 400 }
          )
        }
      }

      // Check if all linenTypes exist
      const linenTypeIds = items.map((item: any) => item.linenTypeId)
      const existingTypes = await prisma.linenType.findMany({
        where: { id: { in: linenTypeIds } }
      })
      if (existingTypes.length === 0) {
        return NextResponse.json(
          { error: 'Các loại đồ vải không tồn tại trong hệ thống' },
          { status: 400 }
        )
      }

      // Create all batches in a transaction
      const createdBatches = await prisma.$transaction(
        items.map((item: any) => 
          prisma.batch.create({
            data: {
              code,
              linenTypeId: item.linenTypeId,
              totalQuantity: Number(item.totalQuantity),
              remainingQuantity: Number(item.totalQuantity),
              importedAt: new Date(importedAt),
            },
            include: {
              linenType: true,
            }
          })
        )
      )

      return NextResponse.json({ count: createdBatches.length, batches: createdBatches }, { status: 201 })
    }

    // Single item fallback mode
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
