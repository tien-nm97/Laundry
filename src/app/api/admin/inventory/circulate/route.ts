import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Verify permissions: inventory:manage
  const auth = await verifyPermission(request, 'inventory:manage')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const payload = auth.payload!

  try {
    const body = await request.json()
    const { batchId, quantity } = body

    if (!batchId || !quantity || Number(quantity) <= 0) {
      return NextResponse.json({ error: 'Thông tin số lượng không hợp lệ' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        include: { linenType: true }
      })

      if (!batch) {
        throw new Error('Lô hàng không tồn tại')
      }

      if (batch.remainingQuantity < Number(quantity)) {
        throw new Error('Số lượng yêu cầu vượt quá số lượng sạch còn lại')
      }

      // 1. Decrement remainingQuantity from Batch
      await tx.batch.update({
        where: { id: batchId },
        data: { remainingQuantity: { decrement: Number(quantity) } }
      })

      // 2. Create LinenCirculation
      const circulation = await tx.linenCirculation.create({
        data: {
          batchId,
          linenTypeId: batch.linenTypeId,
          startUseDate: new Date(),
          originalQuantity: Number(quantity),
          activeQuantity: Number(quantity),
        }
      })

      // 3. Log transaction
      await tx.inventoryTransaction.create({
        data: {
          type: 'CIRCULATE',
          linenTypeId: batch.linenTypeId,
          quantity: Number(quantity),
          user: payload?.username || 'System',
          details: `Đưa ${quantity} cái thuộc lô ${batch.code} vào lưu thông sử dụng.`
        }
      })

      return circulation
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: any) {
    console.error('POST circulate error:', error)
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống' }, { status: 400 })
  }
}
