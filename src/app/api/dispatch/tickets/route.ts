import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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
    console.error('PUT public ticket error:', error)
    return NextResponse.json({ error: 'Lỗi cập nhật phiếu' }, { status: 500 })
  }
}
