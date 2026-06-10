/**
 * @jest-environment node
 */
import { GET, PUT } from '../app/api/dispatch/tickets/route'
import { prisma } from '../lib/db'

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

  it('should mark a ticket as delivered via PUT', async () => {
    const req = new Request('http://localhost/api/dispatch/tickets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: testTicket.id }),
    })
    const res = await PUT(req as any)
    expect(res.status).toBe(200)

    const updated = await res.json()
    expect(updated.status).toBe('DELIVERED')
  })
})
