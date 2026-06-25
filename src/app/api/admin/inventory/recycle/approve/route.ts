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

  // ONLY ADMIN can approve or reject proposals
  if (payload.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên mới được phép duyệt đề xuất này' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { proposalId, action, recycledQuantity } = body

    if (!proposalId || !action) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    if (action !== 'APPROVED' && action !== 'REJECTED') {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })
    }

    if (action === 'APPROVED' && (recycledQuantity === undefined || Number(recycledQuantity) <= 0)) {
      return NextResponse.json({ error: 'Số lượng vỏ gối thu hồi thực tế phải lớn hơn 0' }, { status: 400 })
    }

    const proposal = await prisma.linenRecycleProposal.findUnique({
      where: { id: proposalId },
      include: { circulation: { include: { linenType: true } } }
    })

    if (!proposal) {
      return NextResponse.json({ error: 'Đề xuất tái chế không tồn tại' }, { status: 404 })
    }

    if (proposal.status !== 'PENDING') {
      return NextResponse.json({ error: 'Đề xuất này đã được xử lý trước đó' }, { status: 400 })
    }

    if (action === 'REJECTED') {
      const updatedProposal = await prisma.linenRecycleProposal.update({
        where: { id: proposalId },
        data: {
          status: 'REJECTED',
          approverName: payload.username,
          approvedAt: new Date(),
        }
      })
      return NextResponse.json({ success: true, proposal: updatedProposal })
    }

    // Execute APPROVED transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-fetch circulation and check stock
      const circulation = await tx.linenCirculation.findUnique({
        where: { id: proposal.linenCirculationId },
        include: { linenType: true }
      })

      if (!circulation) {
        throw new Error('Lô đồ vải lưu thông liên kết không tồn tại')
      }

      if (circulation.activeQuantity < proposal.quantity) {
        throw new Error(
          `Số lượng Ga giường lưu hành còn lại (${circulation.activeQuantity}) không đủ để thực hiện duyệt tái chế (${proposal.quantity} chiếc)`
        )
      }

      // 2. Decrement Drap activeQuantity, increment discardedQuantity
      const updatedCirculation = await tx.linenCirculation.update({
        where: { id: proposal.linenCirculationId },
        data: {
          activeQuantity: { decrement: proposal.quantity },
          discardedQuantity: { increment: proposal.quantity }
        }
      })

      // 3. Create discard log
      const reason = `Tái chế thành Vỏ gối (Yêu cầu bởi: ${proposal.proposerName}, Duyệt bởi: ${payload.username}, Thu hồi: ${recycledQuantity} cái)`
      const discardLog = await tx.linenDiscardLog.create({
        data: {
          linenCirculationId: proposal.linenCirculationId,
          quantity: proposal.quantity,
          reason,
        }
      })

      // 4. Find or create "Vỏ gối" LinenType
      let targetLinenType = await tx.linenType.findFirst({
        where: { name: { equals: 'Vỏ gối', mode: 'insensitive' } }
      })

      if (!targetLinenType) {
        targetLinenType = await tx.linenType.create({
          data: {
            name: 'Vỏ gối',
            unit: 'Cái'
          }
        })
      }

      // 5. Create Batch for Pillowcases
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const batchCode = `RECYCLE-${todayStr}`

      const newBatch = await tx.batch.create({
        data: {
          code: batchCode,
          linenTypeId: targetLinenType.id,
          totalQuantity: Number(recycledQuantity),
          remainingQuantity: Number(recycledQuantity),
          importedAt: new Date()
        }
      })

      // 6. Update proposal status
      const updatedProposal = await tx.linenRecycleProposal.update({
        where: { id: proposalId },
        data: {
          status: 'APPROVED',
          recycledQuantity: Number(recycledQuantity),
          approverName: payload.username,
          approvedAt: new Date()
        }
      })

      return { updatedCirculation, discardLog, newBatch, proposal: updatedProposal }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('POST recycle approve error:', error)
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống khi phê duyệt đề xuất' }, { status: 400 })
  }
}
