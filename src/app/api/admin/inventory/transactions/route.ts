import { prisma } from '@/lib/db'
import { verifyPermission } from '@/lib/jwt'
import { hasPermission } from '@/lib/permissions'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyPermission(request, 'admin:view')
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const userRole = auth.payload?.role as string
  const userPermissions = (auth.payload?.permissions as string[]) || []
  const canViewStockNumbers = userRole === 'ADMIN' || hasPermission(userPermissions, 'inventory:view')

  try {
    const transactions = await prisma.inventoryTransaction.findMany({
      include: {
        linenType: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const mappedTransactions = transactions.map((t) => ({
      ...t,
      quantity: canViewStockNumbers ? t.quantity : null,
    }))

    return NextResponse.json(mappedTransactions)
  } catch (error: any) {
    console.error('GET inventory transactions error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải lịch sử giao dịch kho' }, { status: 500 })
  }
}
