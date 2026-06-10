import { prisma } from '@/lib/db'
import { verifyLaundryRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { linenCirculationId, quantity, reason } = body

    if (!linenCirculationId || quantity === undefined) {
      return NextResponse.json(
        { error: 'Thiếu thông tin bắt buộc (mã lưu thông đồ vải, số lượng thanh lý)' },
        { status: 400 }
      )
    }

    if (Number(quantity) <= 0) {
      return NextResponse.json(
        { error: 'Số lượng thanh lý phải lớn hơn 0' },
        { status: 400 }
      )
    }

    // Check circulation existence and availability
    const circulation = await prisma.linenCirculation.findUnique({
      where: { id: linenCirculationId },
    })

    if (!circulation) {
      return NextResponse.json(
        { error: 'Bản ghi lưu thông đồ vải không tồn tại' },
        { status: 400 }
      )
    }

    if (circulation.activeQuantity < Number(quantity)) {
      return NextResponse.json(
        {
          error: `Số lượng báo hỏng (${quantity}) vượt quá số lượng đang hoạt động thực tế (${circulation.activeQuantity})`,
        },
        { status: 400 }
      )
    }

    // Process discard log in transaction
    const discardLog = await prisma.$transaction(async (tx) => {
      // 1. Update circulation quantities
      await tx.linenCirculation.update({
        where: { id: linenCirculationId },
        data: {
          activeQuantity: {
            decrement: Number(quantity),
          },
          discardedQuantity: {
            increment: Number(quantity),
          },
        },
      })

      // 2. Create LinenDiscardLog
      const log = await tx.linenDiscardLog.create({
        data: {
          linenCirculationId,
          quantity: Number(quantity),
          reason: reason || 'Báo hỏng định kỳ',
          loggedAt: new Date(),
        },
      })

      return log
    })

    return NextResponse.json(discardLog, { status: 201 })
  } catch (error: any) {
    console.error('POST laundry discard log error:', error)
    return NextResponse.json({ error: 'Lỗi khi báo hỏng/thanh lý đồ vải' }, { status: 500 })
  }
}
