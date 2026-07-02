import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'
import { hasPermission } from '@/lib/permissions'
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
  const hasPerm =
    payload.role === 'ADMIN' ||
    hasPermission(userPerms, 'inventory:manage')

  if (!hasPerm) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác này' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { linenCirculationId, linenTypeId, quantity } = body

    if ((!linenCirculationId && !linenTypeId) || !quantity) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (Number(quantity) <= 0) {
      return NextResponse.json({ error: 'Số lượng đề xuất phải lớn hơn 0' }, { status: 400 })
    }

    // Case 1: Specific circulation ID provided
    if (linenCirculationId) {
      const circulation = await prisma.linenCirculation.findUnique({
        where: { id: linenCirculationId },
        include: { linenType: true }
      })

      if (!circulation) {
        return NextResponse.json({ error: 'Lô đồ vải lưu thông không tồn tại' }, { status: 404 })
      }

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

      const result = await prisma.$transaction(async (tx) => {
        const proposal = await tx.linenRecycleProposal.create({
          data: {
            linenCirculationId,
            quantity: Number(quantity),
            status: 'PENDING',
            proposerName: payload.username,
          }
        })

        await tx.inventoryTransaction.create({
          data: {
            type: 'RECYCLE_PROPOSE',
            linenTypeId: circulation.linenTypeId,
            quantity: Number(quantity),
            user: payload.username,
            details: `Đề xuất tái chế ${quantity} cái thuộc lô ${circulation.id}.`
          }
        })

        return proposal
      })

      return NextResponse.json(result, { status: 201 })
    }

    // Case 2: Auto FIFO based on linenTypeId
    if (linenTypeId) {
      const linenType = await prisma.linenType.findUnique({
        where: { id: linenTypeId }
      })

      if (!linenType) {
        return NextResponse.json({ error: 'Loại đồ vải không tồn tại' }, { status: 404 })
      }

      const isDrap =
        linenType.name.toLowerCase().includes('drap') ||
        linenType.name.toLowerCase().includes('ga trải') ||
        linenType.name.toLowerCase().includes('ga giường')

      if (!isDrap) {
        return NextResponse.json({ error: 'Chỉ có thể đề xuất tái chế từ các loại Drap/Ga trải giường' }, { status: 400 })
      }

      const result = await prisma.$transaction(async (tx) => {
        let remainingToPropose = Number(quantity)

        const circulations = await tx.linenCirculation.findMany({
          where: { linenTypeId, activeQuantity: { gt: 0 } },
          orderBy: [
            { startUseDate: 'asc' },
            { createdAt: 'asc' }
          ],
          include: { batch: true }
        })

        const totalActive = circulations.reduce((sum, c) => sum + c.activeQuantity, 0)
        if (totalActive < remainingToPropose) {
          throw new Error(`Số lượng đề xuất (${remainingToPropose}) vượt quá tổng lượng lưu hành còn lại (${totalActive})`)
        }

        let firstProposalCreated = null
        for (const circ of circulations) {
          if (remainingToPropose <= 0) break

          const proposeFromThis = Math.min(circ.activeQuantity, remainingToPropose)

          const proposal = await tx.linenRecycleProposal.create({
            data: {
              linenCirculationId: circ.id,
              quantity: proposeFromThis,
              status: 'PENDING',
              proposerName: payload.username,
            }
          })

          if (!firstProposalCreated) {
            firstProposalCreated = proposal
          }

          await tx.inventoryTransaction.create({
            data: {
              type: 'RECYCLE_PROPOSE',
              linenTypeId,
              quantity: proposeFromThis,
              user: payload.username,
              details: `Đề xuất tái chế ${proposeFromThis} cái thuộc lô ${circ.batch.code} (FIFO).`
            }
          })

          remainingToPropose -= proposeFromThis
        }

        return firstProposalCreated
      })

      return NextResponse.json(result, { status: 201 })
    }

    throw new Error('Thiếu tham số định danh hợp lệ')
  } catch (error: unknown) {
    console.error('POST recycle propose error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Lỗi hệ thống khi gửi đề xuất tái chế'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
