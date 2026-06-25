/**
 * @jest-environment node
 */
import { GET, POST } from '../app/api/request/order/route'
import { prisma } from '../lib/db'

describe('Ward QR Request Portal API', () => {
  let testWard: any
  let testLinenType: any

  beforeAll(async () => {
    // Fetch test ward and linen type from seeded data
    testWard = await prisma.ward.findFirst()
    testLinenType = await prisma.linenType.findFirst()
    expect(testWard).not.toBeNull()
    expect(testLinenType).not.toBeNull()
  })

  const createRequest = (method: string, searchParams?: URLSearchParams, body?: any) => {
    let url = 'http://localhost/api/request/order'
    if (searchParams) {
      url += `?${searchParams.toString()}`
    }
    return new Request(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }) as any
  }

  describe('GET Validation Endpoint', () => {
    it('should validate valid wardId and token and return ward info & linen types', async () => {
      const params = new URLSearchParams({
        wardId: testWard.id,
        token: testWard.qrToken,
      })
      const req = createRequest('GET', params)
      const res = await GET(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.ward.name).toBe(testWard.name)
      expect(Array.isArray(data.linenTypes)).toBe(true)
      expect(Array.isArray(data.orderlies)).toBe(true)
    })

    it('should return 401 if wardId or token is invalid', async () => {
      const params = new URLSearchParams({
        wardId: testWard.id,
        token: 'wrong-token-here',
      })
      const req = createRequest('GET', params)
      const res = await GET(req)
      expect(res.status).toBe(401)
    })
  })

  describe('POST Submit Request Endpoint', () => {
    it('should submit a request successfully and create a pending ticket', async () => {
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'TEST',
        items: [
          {
            linenTypeId: testLinenType.id,
            quantity: 15,
          },
        ],
      }
      const req = createRequest('POST', undefined, body)
      const res = await POST(req)
      expect(res.status).toBe(201)

      const createdTicket = await res.json()
      expect(createdTicket.status).toBe('PENDING')
      expect(createdTicket.wardId).toBe(testWard.id)
      expect(createdTicket.requesterName).toBe('TEST')
      expect(createdTicket.items.length).toBe(1)
      expect(createdTicket.items[0].linenTypeId).toBe(testLinenType.id)
      expect(createdTicket.items[0].quantity).toBe(15)

      // Clean up ticket in db
      await prisma.ticket.delete({
        where: { id: createdTicket.id },
      })
    })

    it('should set deliveryDate to today if created before 12:00 PM', async () => {
      const RealDate = global.Date
      const mockDate = new RealDate('2026-06-22T10:00:00+07:00')
      // @ts-ignore
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length > 0) {
            return new RealDate(...args as any)
          }
          return mockDate
        }
        static now() {
          return mockDate.getTime()
        }
      }

      try {
        const body = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'TEST',
          items: [
            {
              linenTypeId: testLinenType.id,
              quantity: 15,
            },
          ],
        }
        const req = createRequest('POST', undefined, body)
        const res = await POST(req)
        expect(res.status).toBe(201)

        const createdTicket = await res.json()
        const delDate = new RealDate(createdTicket.deliveryDate)
        expect(delDate.getUTCFullYear()).toBe(2026)
        expect(delDate.getUTCMonth()).toBe(5)
        expect(delDate.getUTCDate()).toBe(22)
        expect(delDate.getUTCHours()).toBe(0)
        expect(delDate.getUTCMinutes()).toBe(0)

        await prisma.ticket.delete({
          where: { id: createdTicket.id },
        })
      } finally {
        global.Date = RealDate
      }
    })

    it('should set deliveryDate to tomorrow if created after 12:00 PM', async () => {
      const RealDate = global.Date
      const mockDate = new RealDate('2026-06-22T14:00:00+07:00')
      // @ts-ignore
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          if (args.length > 0) {
            return new RealDate(...args as any)
          }
          return mockDate
        }
        static now() {
          return mockDate.getTime()
        }
      }

      try {
        const body = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'TEST',
          items: [
            {
              linenTypeId: testLinenType.id,
              quantity: 15,
            },
          ],
        }
        const req = createRequest('POST', undefined, body)
        const res = await POST(req)
        expect(res.status).toBe(201)

        const createdTicket = await res.json()
        const delDate = new RealDate(createdTicket.deliveryDate)
        expect(delDate.getUTCFullYear()).toBe(2026)
        expect(delDate.getUTCMonth()).toBe(5)
        expect(delDate.getUTCDate()).toBe(23)
        expect(delDate.getUTCHours()).toBe(0)
        expect(delDate.getUTCMinutes()).toBe(0)

        await prisma.ticket.delete({
          where: { id: createdTicket.id },
        })
      } finally {
        global.Date = RealDate
      }
    })

    it('should reject submission with 401 if token is invalid', async () => {
      const body = {
        wardId: testWard.id,
        token: 'invalid-token-code',
        requesterName: 'TEST',
        items: [
          {
            linenTypeId: testLinenType.id,
            quantity: 10,
          },
        ],
      }
      const req = createRequest('POST', undefined, body)
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('should reject submission with 400 if items list is empty or invalid', async () => {
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'TEST',
        items: [],
      }
      const req = createRequest('POST', undefined, body)
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('should reject submission with 400 if requesterName is missing or empty', async () => {
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        items: [
          {
            linenTypeId: testLinenType.id,
            quantity: 10,
          },
        ],
      }
      const req = createRequest('POST', undefined, body)
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  describe('One ticket per day & QR editing limitations', () => {
    it('should return existingTicket if a PENDING ticket exists today', async () => {
      // 1. Create a pending ticket for today
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'ORIGINAL_REQUESTER',
        items: [{ linenTypeId: testLinenType.id, quantity: 5 }]
      }
      const postReq = createRequest('POST', undefined, body)
      const postRes = await POST(postReq)
      expect(postRes.status).toBe(201)
      const createdTicket = await postRes.json()

      try {
        // 2. Perform GET request to verify existingTicket is returned
        const params = new URLSearchParams({
          wardId: testWard.id,
          token: testWard.qrToken,
        })
        const getReq = createRequest('GET', params)
        const getRes = await GET(getReq)
        expect(getRes.status).toBe(200)

        const data = await getRes.json()
        expect(data.existingTicket).toBeDefined()
        expect(data.existingTicket.id).toBe(createdTicket.id)
        expect(data.existingTicket.requesterName).toBe('ORIGINAL_REQUESTER')
        expect(data.existingTicket.items[0].linenTypeId).toBe(testLinenType.id)
        expect(data.existingTicket.items[0].quantity).toBe(5)
      } finally {
        await prisma.ticket.delete({ where: { id: createdTicket.id } })
      }
    })

    it('should return 400 error if today ticket is already processed', async () => {
      // 1. Create a ticket and update status to PREPARED
      const ticket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PREPARED',
          requesterName: 'TEST_PREPARED',
          deliveryDate: new Date(),
          items: {
            create: [{ linenTypeId: testLinenType.id, quantity: 10 }]
          }
        }
      })

      try {
        // 2. Perform GET and expect 400 error
        const params = new URLSearchParams({
          wardId: testWard.id,
          token: testWard.qrToken,
        })
        const getReq = createRequest('GET', params)
        const getRes = await GET(getReq)
        expect(getRes.status).toBe(400)
        const data = await getRes.json()
        expect(data.error).toBe('Phiếu hôm nay đã được xử lý, không thể sửa.')
      } finally {
        await prisma.ticket.delete({ where: { id: ticket.id } })
      }
    })

    it('should update existing pending ticket instead of creating a new one on POST', async () => {
      // 1. Create a pending ticket
      const body = {
        wardId: testWard.id,
        token: testWard.qrToken,
        requesterName: 'NURSE_1',
        items: [{ linenTypeId: testLinenType.id, quantity: 5 }]
      }
      const postReq1 = createRequest('POST', undefined, body)
      const postRes1 = await POST(postReq1)
      expect(postRes1.status).toBe(201)
      const ticket1 = await postRes1.json()

      try {
        // 2. Submit another request (update)
        const updateBody = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'NURSE_2',
          items: [{ linenTypeId: testLinenType.id, quantity: 12 }]
        }
        const postReq2 = createRequest('POST', undefined, updateBody)
        const postRes2 = await POST(postReq2)
        expect(postRes2.status).toBe(201)
        const ticket2 = await postRes2.json()

        // 3. Verify it updated the same ticket
        expect(ticket2.id).toBe(ticket1.id)
        expect(ticket2.requesterName).toBe('NURSE_2')
        expect(ticket2.items.length).toBe(1)
        expect(ticket2.items[0].quantity).toBe(12)

        // Verify database counts
        const dbTicket = await prisma.ticket.findUnique({
          where: { id: ticket1.id },
          include: { items: true }
        })
        expect(dbTicket?.requesterName).toBe('NURSE_2')
        expect(dbTicket?.items.length).toBe(1)
        expect(dbTicket?.items[0].quantity).toBe(12)
      } finally {
        await prisma.ticket.delete({ where: { id: ticket1.id } })
      }
    })

    it('should reject POST with 400 if today ticket is already processed', async () => {
      // 1. Create a PREPARED ticket
      const ticket = await prisma.ticket.create({
        data: {
          wardId: testWard.id,
          status: 'PREPARED',
          requesterName: 'TEST_PREPARED',
          deliveryDate: new Date(),
          items: {
            create: [{ linenTypeId: testLinenType.id, quantity: 10 }]
          }
        }
      })

      try {
        // 2. Perform POST and expect 400 error
        const body = {
          wardId: testWard.id,
          token: testWard.qrToken,
          requesterName: 'NURSE_3',
          items: [{ linenTypeId: testLinenType.id, quantity: 15 }]
        }
        const postReq = createRequest('POST', undefined, body)
        const postRes = await POST(postReq)
        expect(postRes.status).toBe(400)
        const data = await postRes.json()
        expect(data.error).toBe('Phiếu hôm nay đã được xử lý, không thể sửa.')
      } finally {
        await prisma.ticket.delete({ where: { id: ticket.id } })
      }
    })
  })
})
