import { prisma } from '@/lib/db'
import { verifyLaundryRequest } from '@/lib/jwt'
import { autoExpireTickets } from '@/lib/expire-helper'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await autoExpireTickets()
    const tickets = await prisma.ticket.findMany({
      where: { status: 'PENDING' },
      include: {
        ward: true,
        items: {
          include: {
            linenType: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(tickets)
  } catch (error: any) {
    console.error('GET laundry tickets error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải danh sách phiếu yêu cầu' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json()
    const { ticketId } = body

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Thiếu mã phiếu yêu cầu' },
        { status: 400 }
      )
    }

    // Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    })
    if (!ticket) {
      return NextResponse.json(
        { error: 'Phiếu yêu cầu không tồn tại' },
        { status: 404 }
      )
    }

    let nextStatus: 'PREPARED' | 'DELIVERED'
    let updateData: any = {}

    if (ticket.status === 'PENDING') {
      nextStatus = 'PREPARED'
      updateData = { status: nextStatus }
    } else if (ticket.status === 'PREPARED') {
      nextStatus = 'DELIVERED'
      updateData = {
        status: nextStatus,
        deliveryDate: new Date(),
      }
    } else {
      return NextResponse.json(
        { error: 'Phiếu yêu cầu này đã được xử lý xong từ trước' },
        { status: 400 }
      )
    }

    // Update status and set delivery date if DELIVERED
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        items: {
          include: {
            linenType: true,
          },
        },
      },
    })

    return NextResponse.json(updatedTicket)
  } catch (error: any) {
    console.error('PUT laundry ticket error:', error)
    return NextResponse.json({ error: 'Lỗi khi bàn giao đồ vải' }, { status: 500 })
  }
}
