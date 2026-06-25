import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const wardId = searchParams.get('wardId')
    const token = searchParams.get('token')

    if (!wardId || !token) {
      return NextResponse.json(
        { error: 'Thiếu mã khoa phòng hoặc mã token truy cập' },
        { status: 400 }
      )
    }

    // Validate ward and token
    const ward = await prisma.ward.findFirst({
      where: {
        id: wardId,
        qrToken: token,
      },
    })

    if (!ward) {
      return NextResponse.json(
        { error: 'Liên kết mã QR không hợp lệ hoặc đã bị vô hiệu hóa' },
        { status: 401 }
      )
    }

    const now = new Date()
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const vnYear = vnTime.getUTCFullYear()
    const vnMonth = vnTime.getUTCMonth()
    const vnDay = vnTime.getUTCDate()
    const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)
    const vnTodayEnd = new Date(Date.UTC(vnYear, vnMonth, vnDay, 23, 59, 59, 999) - 7 * 60 * 60 * 1000)

    const existingTicket = await prisma.ticket.findFirst({
      where: {
        wardId: ward.id,
        createdAt: {
          gte: vnTodayStart,
          lte: vnTodayEnd,
        },
      },
      include: {
        items: {
          include: {
            linenType: true,
          },
        },
      },
    })

    if (existingTicket) {
      if (existingTicket.status !== 'PENDING') {
        return NextResponse.json(
          { error: 'Phiếu hôm nay đã được xử lý, không thể sửa.' },
          { status: 400 }
        )
      }
    }

    // Fetch available linen types
    const linenTypes = await prisma.linenType.findMany({
      orderBy: { name: 'asc' },
    })

    // Fetch active orderlies
    const orderlies = await prisma.staff.findMany({
      where: { hientrang: 'Đang làm' },
      orderBy: { nhanvien: 'asc' },
    })

    return NextResponse.json({
      ward: {
        id: ward.id,
        name: ward.name,
      },
      linenTypes,
      orderlies,
      existingTicket: existingTicket ? {
        id: existingTicket.id,
        requesterName: existingTicket.requesterName,
        items: existingTicket.items.map(item => ({
          linenTypeId: item.linenTypeId,
          quantity: item.quantity,
          linenType: item.linenType
        }))
      } : null
    })
  } catch (error: any) {
    console.error('GET request validation error:', error)
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi khi xác thực thông tin' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { wardId, token, requesterName, items } = body

    if (!wardId || !token) {
      return NextResponse.json(
        { error: 'Thiếu thông tin xác thực khoa phòng' },
        { status: 401 }
      )
    }

    if (!requesterName || typeof requesterName !== 'string' || !requesterName.trim()) {
      return NextResponse.json(
        { error: 'Thiếu thông tin người yêu cầu (Hộ lý)' },
        { status: 400 }
      )
    }

    // Validate ward and token
    const ward = await prisma.ward.findFirst({
      where: {
        id: wardId,
        qrToken: token,
      },
    })

    if (!ward) {
      return NextResponse.json(
        { error: 'Không có quyền thực hiện yêu cầu' },
        { status: 401 }
      )
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Danh sách đồ vải yêu cầu không được để trống' },
        { status: 400 }
      )
    }

    // Validate each requested item
    for (const item of items) {
      if (!item.linenTypeId || !item.quantity || Number(item.quantity) <= 0) {
        return NextResponse.json(
          { error: 'Thông tin loại đồ vải hoặc số lượng yêu cầu không hợp lệ' },
          { status: 400 }
        )
      }
      
      const ltExists = await prisma.linenType.findUnique({
        where: { id: item.linenTypeId },
      })
      if (!ltExists) {
        return NextResponse.json(
          { error: 'Loại đồ vải yêu cầu không tồn tại trong hệ thống' },
          { status: 400 }
        )
      }
    }

    const now = new Date()
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
    const vnYear = vnTime.getUTCFullYear()
    const vnMonth = vnTime.getUTCMonth()
    const vnDay = vnTime.getUTCDate()
    const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)
    const vnTodayEnd = new Date(Date.UTC(vnYear, vnMonth, vnDay, 23, 59, 59, 999) - 7 * 60 * 60 * 1000)

    const existingTicket = await prisma.ticket.findFirst({
      where: {
        wardId: ward.id,
        createdAt: {
          gte: vnTodayStart,
          lte: vnTodayEnd,
        },
      },
    })

    if (existingTicket) {
      if (existingTicket.status !== 'PENDING') {
        return NextResponse.json(
          { error: 'Phiếu hôm nay đã được xử lý, không thể sửa.' },
          { status: 400 }
        )
      }

      // Update in transaction
      const updatedTicket = await prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.update({
          where: { id: existingTicket.id },
          data: {
            requesterName: requesterName.trim(),
            items: {
              deleteMany: {},
              create: items.map((item: any) => ({
                linenTypeId: item.linenTypeId,
                quantity: Number(item.quantity)
              }))
            }
          },
          include: {
            items: {
              include: {
                linenType: true
              }
            }
          }
        })
        return ticket
      })

      return NextResponse.json(updatedTicket, { status: 201 })
    }

    // Create Ticket and TicketItems in a transaction
    const newTicket = await prisma.$transaction(async (tx) => {
      const vnHours = vnTime.getUTCHours()

      const deliveryDate = new Date(now)
      if (vnHours >= 12) {
        deliveryDate.setDate(deliveryDate.getDate() + 1)
      }
      deliveryDate.setHours(0, 0, 0, 0)

      const ticket = await tx.ticket.create({
        data: {
          wardId: ward.id,
          status: 'PENDING',
          requesterName: requesterName.trim(),
          deliveryDate: deliveryDate,
          items: {
            create: items.map((item: any) => ({
              linenTypeId: item.linenTypeId,
              quantity: Number(item.quantity),
            })),
          },
        },
        include: {
          items: {
            include: {
              linenType: true,
            },
          },
        },
      })
      return ticket
    })

    return NextResponse.json(newTicket, { status: 201 })
  } catch (error: any) {
    console.error('POST request ticket creation error:', error)
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi khi gửi yêu cầu' },
      { status: 500 }
    )
  }
}
