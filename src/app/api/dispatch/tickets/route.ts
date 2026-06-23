import { prisma } from '@/lib/db'
import { autoExpireTickets } from '@/lib/expire-helper'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Run auto-expiration logic first
    await autoExpireTickets()

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['PENDING', 'PREPARED'] },
        createdAt: { gte: cutoff },
      },
      include: {
        ward: true,
        items: {
          include: {
            linenType: true,
          },
        },
      },
    })

    // Sort: PENDING first, then PREPARED. Within each, order by createdAt asc
    tickets.sort((a, b) => {
      if (a.status === b.status) {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return a.status === 'PENDING' ? -1 : 1
    })

    return NextResponse.json(tickets)
  } catch (error: any) {
    console.error('GET public tickets error:', error)
    return NextResponse.json({ error: 'Lỗi tải danh sách phiếu' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { ticketId } = body

    if (!ticketId) {
      return NextResponse.json({ error: 'Thiếu mã phiếu' }, { status: 400 })
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Không tìm thấy phiếu yêu cầu' }, { status: 404 })
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
      return NextResponse.json({ error: 'Phiếu đã được xử lý xong' }, { status: 400 })
    }

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
    console.error('PUT public ticket error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật phiếu' }, { status: 500 })
  }
}
