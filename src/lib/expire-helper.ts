import { prisma } from './db'

export async function autoExpireTickets() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await prisma.ticket.updateMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    data: {
      status: 'INCOMPLETE',
    },
  })
}
