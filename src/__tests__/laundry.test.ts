/**
 * @jest-environment node
 */
import { GET as getTickets, PUT as putTicket } from '../app/api/laundry/tickets/route'
import { GET as getCirculations, POST as postCirculation } from '../app/api/laundry/circulations/route'
import { POST as postDiscard } from '../app/api/laundry/discards/route'
import { GET as getReports } from '../app/api/laundry/reports/route'
import { prisma } from '../lib/db'
import { signToken } from '../lib/jwt'

describe('Laundry Operations API', () => {
  let laundryToken: string
  let adminToken: string
  let testWard: any
  let testLinenType: any
  let testBatch: any

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long'
    laundryToken = await signToken({ userId: '2', username: 'laundry', role: 'LAUNDRY' })
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })

    testWard = await prisma.ward.findFirst()
    testLinenType = await prisma.linenType.findFirst()

    // Create a temporary batch to test extraction
    testBatch = await prisma.batch.create({
      data: {
        code: `L-BATCH-${Date.now()}`,
        linenTypeId: testLinenType.id,
        totalQuantity: 200,
        remainingQuantity: 200,
        importedAt: new Date(),
      },
    })
  })

  afterAll(async () => {
    // Cleanup temporary batch
    await prisma.batch.delete({ where: { id: testBatch.id } })
  })

  const createRequest = (method: string, body?: any, token?: string) => {
    const headers: Record<string, string> = {}
    if (body) {
      headers['Content-Type'] = 'application/json'
    }
    if (token) {
      headers['Cookie'] = `token=${token}`
    }
    return new Request('http://localhost/api/laundry/test', {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }) as any
  }

  describe('Authorization check', () => {
    it('should reject requests without token', async () => {
      const req = createRequest('GET')
      const res = await getTickets(req)
      expect(res.status).toBe(401)
    })

    it('should reject requests if not LAUNDRY role', async () => {
      const req = createRequest('GET', null, adminToken)
      const res = await getTickets(req)
      expect(res.status).toBe(403)
    })
  })

  describe('Tickets API', () => {
    it('should retrieve pending tickets and fulfill a ticket', async () => {
      // 1. Create a pending ticket
      const ticket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PENDING',
          requesterName: 'Test Requester',
          deliveryDate: new Date(),
          items: {
            create: [
              { linenTypeId: testLinenType.id, quantity: 5 },
            ],
          },
        },
      })

      // 2. Fetch pending tickets list
      const getReq = createRequest('GET', null, laundryToken)
      const getRes = await getTickets(getReq)
      expect(getRes.status).toBe(200)
      const tickets = await getRes.json()
      expect(tickets.some((t: any) => t.id === ticket.id)).toBe(true)

      // 3. Mark ticket as PREPARED
      const putReq = createRequest('PUT', { ticketId: ticket.id }, laundryToken)
      const putRes = await putTicket(putReq)
      expect(putRes.status).toBe(200)
      const updated = await putRes.json()
      expect(updated.status).toBe('PREPARED')

      // 4. Mark ticket as DELIVERED
      const putReq2 = createRequest('PUT', { ticketId: ticket.id }, laundryToken)
      const putRes2 = await putTicket(putReq2)
      expect(putRes2.status).toBe(200)
      const updated2 = await putRes2.json()
      expect(updated2.status).toBe('DELIVERED')

      // Clean up
      await prisma.ticket.delete({ where: { id: ticket.id } })
    })
  })

  describe('Circulations API', () => {
    it('should extract active sub-batches from total stock', async () => {
      const body = {
        batchId: testBatch.id,
        startUseDate: new Date().toISOString(),
        quantity: 50,
      }

      const postReq = createRequest('POST', body, laundryToken)
      const postRes = await postCirculation(postReq)
      expect(postRes.status).toBe(201)

      const circulation = await postRes.json()
      expect(circulation.batchId).toBe(testBatch.id)
      expect(circulation.originalQuantity).toBe(50)
      expect(circulation.activeQuantity).toBe(50)

      // Verify batch remaining quantity is decremented
      const updatedBatch = await prisma.batch.findUnique({
        where: { id: testBatch.id },
      })
      expect(updatedBatch?.remainingQuantity).toBe(150)

      // Fetch active circulations list
      const getReq = createRequest('GET', null, laundryToken)
      const getRes = await getCirculations(getReq)
      expect(getRes.status).toBe(200)
      const list = await getRes.json()
      expect(list.some((c: any) => c.id === circulation.id)).toBe(true)

      // Clean up circulation and discard logs
      await prisma.linenCirculation.delete({ where: { id: circulation.id } })
    })

    it('should reject extraction if quantity exceeds remaining quantity', async () => {
      const body = {
        batchId: testBatch.id,
        startUseDate: new Date().toISOString(),
        quantity: 300, // Exceeds 200
      }
      const postReq = createRequest('POST', body, laundryToken)
      const postRes = await postCirculation(postReq)
      expect(postRes.status).toBe(400)
    })
  })

  describe('Discards and Lifespan reports', () => {
    it('should log damaged items and calculate lifespan', async () => {
      // 1. Create a circulation sub-batch with a start-use date 10 days ago
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const circulation = await prisma.linenCirculation.create({
        data: {
          batchId: testBatch.id,
          linenTypeId: testLinenType.id,
          startUseDate: tenDaysAgo,
          originalQuantity: 10,
          activeQuantity: 10,
        },
      })

      // 2. Log 2 items as discarded
      const body = {
        linenCirculationId: circulation.id,
        quantity: 2,
        reason: 'Rách vải',
      }
      const postReq = createRequest('POST', body, laundryToken)
      const postRes = await postDiscard(postReq)
      expect(postRes.status).toBe(201)
      const logged = await postRes.json()
      expect(logged.quantity).toBe(2)

      // Verify active quantity is decremented
      const updatedCirc = await prisma.linenCirculation.findUnique({
        where: { id: circulation.id },
      })
      expect(updatedCirc?.activeQuantity).toBe(8)
      expect(updatedCirc?.discardedQuantity).toBe(2)

      // 3. Fetch reports and verify average lifespan calculation
      const repReq = createRequest('GET', null, laundryToken)
      const repRes = await getReports(repReq)
      expect(repRes.status).toBe(200)
      const reports = await repRes.json()

      const batchReport = reports.find((r: any) => r.id === testBatch.id)
      expect(batchReport).toBeDefined()
      expect(batchReport.totalDiscarded).toBe(2)
      // Lifespan should be around 10 days
      expect(batchReport.averageLifespanDays).toBeCloseTo(10, 0)

      // Clean up discard logs and circulation
      await prisma.linenDiscardLog.deleteMany({ where: { linenCirculationId: circulation.id } })
      await prisma.linenCirculation.delete({ where: { id: circulation.id } })
    })
  })
})
