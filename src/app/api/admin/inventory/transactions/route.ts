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
    const transactions = await prisma.inventoryTransaction.findMany({
      include: {
        linenType: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(transactions)
  } catch (error: any) {
    console.error('GET inventory transactions error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải lịch sử giao dịch kho' }, { status: 500 })
  }
}
