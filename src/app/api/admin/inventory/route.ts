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
    // 1. Get all linen types with their batches and circulations
    const linenTypes = await prisma.linenType.findMany({
      include: {
        batches: true,
        circulations: true,
      },
      orderBy: { name: 'asc' },
    })

    // 2. Map and aggregate counts
    const inventory = linenTypes.map((lt) => {
      const originalStock = lt.batches.reduce((sum, b) => sum + b.remainingQuantity, 0)
      const inCirculation = lt.circulations.reduce((sum, c) => sum + c.activeQuantity, 0)
      const discarded = lt.circulations.reduce((sum, c) => sum + c.discardedQuantity, 0)
      
      return {
        linenTypeId: lt.id,
        name: lt.name,
        unit: lt.unit,
        originalStock: canViewStockNumbers ? originalStock : null,
        inCirculation: canViewStockNumbers ? inCirculation : null,
        discarded: canViewStockNumbers ? discarded : null,
        minStock: canViewStockNumbers ? lt.minStock : null,
        totalAccumulated: canViewStockNumbers ? (originalStock + inCirculation + discarded) : null,
      }
    })

    // 3. Get all batches for history table
    const batches = await prisma.batch.findMany({
      include: {
        linenType: true,
      },
      orderBy: { importedAt: 'desc' },
    })

    const mappedBatches = batches.map(b => ({
      ...b,
      totalQuantity: canViewStockNumbers ? b.totalQuantity : null,
      remainingQuantity: canViewStockNumbers ? b.remainingQuantity : null,
    }))

    // 4. Get active circulations (activeQuantity > 0) for dropdown in damage/recycle flow
    const activeCirculations = await prisma.linenCirculation.findMany({
      where: {
        activeQuantity: { gt: 0 }
      },
      include: {
        linenType: true,
        batch: true,
      },
    })

    // Sort in memory: Group by LinenType name, then by startUseDate ascending (FIFO)
    activeCirculations.sort((a, b) => {
      const nameA = a.linenType.name.toLowerCase()
      const nameB = b.linenType.name.toLowerCase()
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB)
      }
      const dateA = new Date(a.startUseDate).getTime()
      const dateB = new Date(b.startUseDate).getTime()
      if (dateA !== dateB) {
        return dateA - dateB
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    const mappedCirculations = activeCirculations.map(c => ({
      ...c,
      activeQuantity: canViewStockNumbers ? c.activeQuantity : null,
    }))

    // 5. Get recycle proposals (for tracking and approval list)
    const recycleProposals = await prisma.linenRecycleProposal.findMany({
      include: {
        circulation: {
          include: {
            linenType: true,
            batch: true,
          }
        }
      },
      orderBy: { proposedAt: 'desc' },
    })

    return NextResponse.json({
      inventory,
      batches: mappedBatches,
      activeCirculations: mappedCirculations,
      recycleProposals,
    })
  } catch (error: unknown) {
    console.error('GET inventory error:', error)
    return NextResponse.json({ error: 'Lỗi khi tải dữ liệu kho' }, { status: 500 })
  }
}
