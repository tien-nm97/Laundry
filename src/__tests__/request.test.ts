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
        requesterName: 'Nguyễn Văn Hộ lý',
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
      expect(createdTicket.requesterName).toBe('Nguyễn Văn Hộ lý')
      expect(createdTicket.items.length).toBe(1)
      expect(createdTicket.items[0].linenTypeId).toBe(testLinenType.id)
      expect(createdTicket.items[0].quantity).toBe(15)

      // Clean up ticket in db
      await prisma.ticket.delete({
        where: { id: createdTicket.id },
      })
    })

    it('should reject submission with 401 if token is invalid', async () => {
      const body = {
        wardId: testWard.id,
        token: 'invalid-token-code',
        requesterName: 'Nguyễn Văn Hộ lý',
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
        requesterName: 'Nguyễn Văn Hộ lý',
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
})
