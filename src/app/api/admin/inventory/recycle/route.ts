import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'
import { hasPermission } from '@/lib/permissions'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Verify authentication and role (ADMIN or SUPERVISOR)
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
  const hasPerm =
    payload.role === 'ADMIN' ||
    hasPermission(userPerms, 'inventory:discard')
    
  if (!hasPerm) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { linenCirculationId, linenTypeId, discardQuantity, action, recycledQuantity } = body

    if ((!linenCirculationId && !linenTypeId) || !discardQuantity || !action) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (Number(discardQuantity) <= 0) {
      return NextResponse.json({ error: 'Số lượng báo hỏng phải lớn hơn 0' }, { status: 400 })
    }

    if (action === 'RECYCLE') {
      return NextResponse.json(
        { error: 'Yêu cầu tái chế phải được thực hiện thông qua quy trình đề xuất và phê duyệt' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      // Case 1: Specific circulation ID provided (legacy support)
      if (linenCirculationId) {
        const circulation = await tx.linenCirculation.findUnique({
          where: { id: linenCirculationId },
          include: { linenType: true, batch: true }
        })

        if (!circulation) {
          throw new Error('Lô đồ vải lưu thông không tồn tại')
        }

        if (circulation.activeQuantity < Number(discardQuantity)) {
          throw new Error(`Số lượng báo hỏng vượt quá lượng lưu hành còn lại (${circulation.activeQuantity})`)
        }

        // Update activeQuantity and discardedQuantity
        const updatedCirculation = await tx.linenCirculation.update({
          where: { id: linenCirculationId },
          data: {
            activeQuantity: { decrement: Number(discardQuantity) },
            discardedQuantity: { increment: Number(discardQuantity) },
          }
        })

        // Create LinenDiscardLog
        const discardLog = await tx.linenDiscardLog.create({
          data: {
            linenCirculationId,
            quantity: Number(discardQuantity),
            reason: 'Báo hỏng thông thường',
          }
        })

        // Create InventoryTransaction
        await tx.inventoryTransaction.create({
          data: {
            type: 'DISCARD',
            linenTypeId: circulation.linenTypeId,
            quantity: Number(discardQuantity),
            user: payload?.username || 'System',
            details: `Báo hỏng ${discardQuantity} cái thuộc lô ${circulation.batch.code}.`
          }
        })

        return { updatedCirculation, discardLog }
      }

      // Case 2: Apply FIFO automatically based on linenTypeId
      if (linenTypeId) {
        let remainingToDiscard = Number(discardQuantity)

        const circulations = await tx.linenCirculation.findMany({
          where: { linenTypeId, activeQuantity: { gt: 0 } },
          orderBy: [
            { startUseDate: 'asc' },
            { createdAt: 'asc' }
          ],
          include: { linenType: true, batch: true }
        })

        const totalActive = circulations.reduce((sum, c) => sum + c.activeQuantity, 0)
        if (totalActive < remainingToDiscard) {
          throw new Error(`Số lượng báo hỏng (${remainingToDiscard}) vượt quá tổng lượng lưu hành còn lại (${totalActive})`)
        }

        const logs = []
        for (const circ of circulations) {
          if (remainingToDiscard <= 0) break

          const discardFromThis = Math.min(circ.activeQuantity, remainingToDiscard)

          await tx.linenCirculation.update({
            where: { id: circ.id },
            data: {
              activeQuantity: { decrement: discardFromThis },
              discardedQuantity: { increment: discardFromThis }
            }
          })

          const log = await tx.linenDiscardLog.create({
            data: {
              linenCirculationId: circ.id,
              quantity: discardFromThis,
              reason: 'Báo hỏng thông thường (Tự động FIFO)'
            }
          })
          logs.push(log)

          await tx.inventoryTransaction.create({
            data: {
              type: 'DISCARD',
              linenTypeId,
              quantity: discardFromThis,
              user: payload?.username || 'System',
              details: `Báo hỏng ${discardFromThis} cái thuộc lô ${circ.batch.code} (FIFO).`
            }
          })

          remainingToDiscard -= discardFromThis
        }

        return { success: true, discardLogsCount: logs.length }
      }

      throw new Error('Thiếu tham số định danh hợp lệ')
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    console.error('POST inventory recycle error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống khi báo hỏng/tái chế'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
