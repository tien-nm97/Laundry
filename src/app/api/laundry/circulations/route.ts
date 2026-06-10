import { prisma } from '@/lib/db'
import { verifyLaundryRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const circulations = await prisma.linenCirculation.findMany({
      include: {
        batch: true,
        linenType: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(circulations)
  } catch (error: any) {
    console.error('GET laundry circulations error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách lưu thông đồ vải' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { batchId, startUseDate, quantity } = body

    if (!batchId || !startUseDate || quantity === undefined) {
      return NextResponse.json(
        { error: 'Thiếu thông tin bắt buộc (mã lô gốc, ngày bắt đầu sử dụng, số lượng đưa vào lưu thông)' },
        { status: 400 }
      )
    }

    if (Number(quantity) <= 0) {
      return NextResponse.json(
        { error: 'Số lượng phải lớn hơn 0' },
        { status: 400 }
      )
    }

    // Check batch availability
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Lô hàng nhập gốc không tồn tại' },
        { status: 400 }
      )
    }

    if (batch.remainingQuantity < Number(quantity)) {
      return NextResponse.json(
        { error: `Số lượng yêu cầu (${quantity}) vượt quá trữ lượng còn lại trong lô gốc (${batch.remainingQuantity})` },
        { status: 400 }
      )
    }

    // Process extraction in transaction
    const newCirculation = await prisma.$transaction(async (tx) => {
      // 1. Decrement batch remainingQuantity
      await tx.batch.update({
        where: { id: batchId },
        data: {
          remainingQuantity: {
            decrement: Number(quantity),
          },
        },
      })

      // 2. Create LinenCirculation
      const circulation = await tx.linenCirculation.create({
        data: {
          batchId,
          linenTypeId: batch.linenTypeId,
          startUseDate: new Date(startUseDate),
          originalQuantity: Number(quantity),
          activeQuantity: Number(quantity),
        },
        include: {
          batch: true,
          linenType: true,
        },
      })

      return circulation
    })

    return NextResponse.json(newCirculation, { status: 201 })
  } catch (error: any) {
    console.error('POST laundry circulation extraction error:', error)
    return NextResponse.json({ error: 'Lỗi khi đưa đồ vải vào lưu thông' }, { status: 500 })
  }
}
