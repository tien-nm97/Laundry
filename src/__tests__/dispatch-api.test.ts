/**
 * @jest-environment node
 */
import { GET, PUT } from '../app/api/dispatch/tickets/route'
import { prisma } from '../lib/db'
import { autoExpireTickets } from '../lib/expire-helper'

describe('Public Dispatch Tickets API', () => {
  let testWard: any
  let testLinenType: any
  let testTicket: any

  beforeAll(async () => {
    testWard = await prisma.ward.findFirst()
    testLinenType = await prisma.linenType.findFirst()

    testTicket = await prisma.ticket.create({
      data: {
        wardId: testWard.id,
        status: 'PENDING',
        requesterName: 'Test Requester',
        deliveryDate: new Date(),
        items: {
          create: [
            { linenTypeId: testLinenType.id, quantity: 8 },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    if (testTicket) {
      await prisma.ticket.deleteMany({
        where: { id: testTicket.id },
      })
    }
  })

  it('should return pending tickets with status 200', async () => {
    const req = new Request('http://localhost/api/dispatch/tickets')
    const res = await GET(req as any)
    expect(res.status).toBe(200)

    const tickets = await res.json()
    expect(Array.isArray(tickets)).toBe(true)
    expect(tickets.some((t: any) => t.id === testTicket.id)).toBe(true)
  })

  it('should transition a ticket PENDING -> PREPARED -> DELIVERED via PUT', async () => {
    // PENDING -> PREPARED
    const req1 = new Request('http://localhost/api/dispatch/tickets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: testTicket.id }),
    })
    const res1 = await PUT(req1 as any)
    expect(res1.status).toBe(200)
    const updated1 = await res1.json()
    expect(updated1.status).toBe('PREPARED')

    // PREPARED -> DELIVERED
    const req2 = new Request('http://localhost/api/dispatch/tickets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: testTicket.id }),
    })
    const res2 = await PUT(req2 as any)
    expect(res2.status).toBe(200)
    const updated2 = await res2.json()
    expect(updated2.status).toBe('DELIVERED')
  })

  it('should auto-expire PENDING tickets past the 12:00 PM next day deadline to INCOMPLETE', async () => {
    // Create an expired ticket (created 2 days ago, guaranteed to be expired)
    const expiredTicket = await prisma.ticket.create({
      data: {
        wardId: testWard.id,
        status: 'PENDING',
        requesterName: 'Test Expired',
        deliveryDate: new Date(),
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        items: {
          create: [{ linenTypeId: testLinenType.id, quantity: 2 }],
        },
      },
    })

    try {
      // Run autoExpireTickets
      await autoExpireTickets()

      // Fetch from DB directly to verify status
      const checkTicket = await prisma.ticket.findUnique({
        where: { id: expiredTicket.id },
      })
      expect(checkTicket?.status).toBe('INCOMPLETE')
    } finally {
      // Clean up
      await prisma.ticket.deleteMany({
        where: { id: expiredTicket.id },
      })
    }
  })
})
