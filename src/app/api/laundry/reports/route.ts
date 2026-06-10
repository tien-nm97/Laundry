import { prisma } from '@/lib/db'
import { verifyLaundryRequest } from '@/lib/jwt'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifyLaundryRequest(request)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const batches = await prisma.batch.findMany({
      include: {
        linenType: true,
        circulations: {
          include: {
            discardLogs: true,
          },
        },
      },
      orderBy: { importedAt: 'desc' },
    })

    const report = batches.map((batch) => {
      let totalDiscarded = 0
      let totalWeightedDays = 0

      let activeCirculationCount = 0
      let originalCirculationCount = 0

      batch.circulations.forEach((circ) => {
        activeCirculationCount += circ.activeQuantity
        originalCirculationCount += circ.originalQuantity

        circ.discardLogs.forEach((log) => {
          totalDiscarded += log.quantity
          const diffMs = log.loggedAt.getTime() - circ.startUseDate.getTime()
          const diffDays = diffMs / (1000 * 60 * 60 * 24)
          totalWeightedDays += log.quantity * Math.max(0, diffDays)
        })
      })

      const averageLifespanDays = totalDiscarded > 0 ? totalWeightedDays / totalDiscarded : 0

      return {
        id: batch.id,
        code: batch.code,
        linenType: {
          name: batch.linenType.name,
          unit: batch.linenType.unit,
        },
        totalQuantity: batch.totalQuantity,
        remainingQuantity: batch.remainingQuantity,
        originalCirculationCount,
        activeCirculationCount,
        totalDiscarded,
        averageLifespanDays,
      }
    })

    return NextResponse.json(report)
  } catch (error: any) {
    console.error('GET laundry reports error:', error)
    return NextResponse.json({ error: 'Lỗi khi tính toán báo cáo tuổi thọ đồ vải' }, { status: 500 })
  }
}
