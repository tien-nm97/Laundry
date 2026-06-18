import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyPermission(request, 'admin:view')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        ward: true,
        items: {
          include: {
            linenType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(tickets)
  } catch (error: any) {
    console.error('GET admin tickets error:', error)
    return NextResponse.json({ error: 'Lỗi tải danh sách phiếu yêu cầu' }, { status: 500 })
  }
}
