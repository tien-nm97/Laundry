import { prisma } from './db'

export async function autoExpireTickets() {
  const now = new Date()
  // Adjust to UTC+7 (Vietnam Time)
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const vnHours = vnTime.getUTCHours()

  const vnYear = vnTime.getUTCFullYear()
  const vnMonth = vnTime.getUTCMonth()
  const vnDay = vnTime.getUTCDate()

  // Construct today's date at 00:00:00 Vietnam Time in UTC
  const vnTodayStart = new Date(Date.UTC(vnYear, vnMonth, vnDay, 0, 0, 0, 0) - 7 * 60 * 60 * 1000)

  let cutoffDate = new Date(vnTodayStart)
  if (vnHours < 12) {
    // If local time in Vietnam is before 12:00 PM today,
    // cutoff is yesterday 00:00:00 Vietnam Time (tickets created before yesterday, i.e. Day N-2 or earlier, are expired)
    cutoffDate.setDate(cutoffDate.getDate() - 1)
  }

  await prisma.ticket.updateMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoffDate },
    },
    data: {
      status: 'INCOMPLETE',
    },
  })
}
