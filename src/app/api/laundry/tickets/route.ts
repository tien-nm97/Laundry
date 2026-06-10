import { prisma } from '@/lib/db'
import { verifyLaundryRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
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

    if (ticket.status === 'DELIVERED') {
      return NextResponse.json(
        { error: 'Phiếu yêu cầu này đã được bàn giao từ trước' },
        { status: 400 }
      )
    }

    // Update status to DELIVERED and set delivery date to now
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'DELIVERED',
        deliveryDate: new Date(),
      },
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
