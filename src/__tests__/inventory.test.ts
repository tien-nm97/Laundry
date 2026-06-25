/**
 * @jest-environment node
 */
import { GET } from '../app/api/admin/inventory/route'
import { POST } from '../app/api/admin/inventory/recycle/route'
import { prisma } from '../lib/db'
import { signToken } from '../lib/jwt'

describe('Inventory & Recycling Admin APIs', () => {
  let adminToken: string
  let supervisorToken: string
  let laundryToken: string
  let testBatch: any
  let testLinenTypeDrap: any
  let testCirculation: any

  beforeAll(async () => {
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
    supervisorToken = await signToken({ userId: '2', username: 'supervisor', role: 'SUPERVISOR', permissions: ['admin:view'] })
    laundryToken = await signToken({ userId: '3', username: 'laundry', role: 'LAUNDRY' })

    // Create test LinenType Drap
    testLinenTypeDrap = await prisma.linenType.create({
      data: { name: 'TEST-DRAP-1', unit: 'Tấm' }
    })

    testBatch = await prisma.batch.create({
      data: {
        code: 'TEST-BATCH-INV',
        linenTypeId: testLinenTypeDrap.id,
        totalQuantity: 100,
        remainingQuantity: 50,
        importedAt: new Date()
      }
    })

    testCirculation = await prisma.linenCirculation.create({
      data: {
        batchId: testBatch.id,
        linenTypeId: testLinenTypeDrap.id,
        startUseDate: new Date(),
        originalQuantity: 50,
        activeQuantity: 50,
      }
    })
  })

  afterAll(async () => {
    // Delete logs and batches first
    await prisma.linenDiscardLog.deleteMany({
      where: { circulation: { linenTypeId: testLinenTypeDrap.id } }
    })
    await prisma.linenCirculation.deleteMany({
      where: { linenTypeId: testLinenTypeDrap.id }
    })
    await prisma.batch.deleteMany({
      where: { code: { startsWith: 'RECYCLE-' } }
    })
    await prisma.batch.deleteMany({
      where: { id: testBatch.id }
    })
    await prisma.linenType.deleteMany({
      where: { id: testLinenTypeDrap.id }
    })
  })

  const createRequest = (method: string, cookieToken?: string, body?: any) => {
    const headers: Record<string, string> = {}
    if (cookieToken) {
      headers['cookie'] = `token=${cookieToken}`
    }
    if (body) {
      headers['Content-Type'] = 'application/json'
    }
    return new Request('http://localhost/api/admin/inventory', {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }) as any
  }

  describe('GET /api/admin/inventory', () => {
    it('should allow Admin and Supervisor to fetch aggregated inventory', async () => {
      const reqAdmin = createRequest('GET', adminToken)
      const resAdmin = await GET(reqAdmin)
      expect(resAdmin.status).toBe(200)

      const dataAdmin = await resAdmin.json()
      expect(dataAdmin.inventory).toBeDefined()
      expect(dataAdmin.batches).toBeDefined()
      expect(dataAdmin.activeCirculations).toBeDefined()

      // Test with Supervisor token
      const reqSuper = createRequest('GET', supervisorToken)
      const resSuper = await GET(reqSuper)
      expect(resSuper.status).toBe(200)
    })

    it('should reject Laundry role with 403', async () => {
      const req = createRequest('GET', laundryToken)
      const res = await GET(req)
      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/admin/inventory/recycle', () => {
    it('should perform normal discard successfully', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        discardQuantity: 5,
        action: 'DISCARD'
      }
      const req = createRequest('POST', adminToken, body)
      const res = await POST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.updatedCirculation.activeQuantity).toBe(45)
      expect(data.updatedCirculation.discardedQuantity).toBe(5)
      expect(data.discardLog.reason).toBe('Báo hỏng thông thường')
    })

    it('should perform Drap to Pillowcase recycling successfully', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        discardQuantity: 10,
        action: 'RECYCLE',
        recycledQuantity: 20
      }
      const req = createRequest('POST', supervisorToken, body)
      const res = await POST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.updatedCirculation.activeQuantity).toBe(35)
      expect(data.updatedCirculation.discardedQuantity).toBe(15)
      expect(data.discardLog.reason).toBe('Tái chế thành Vỏ gối (Thu hồi: 20 cái)')
      expect(data.newBatch).toBeDefined()
      expect(data.newBatch.totalQuantity).toBe(20)
      expect(data.newBatch.remainingQuantity).toBe(20)
    })

    it('should reject if discard quantity exceeds active quantity', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        discardQuantity: 100,
        action: 'DISCARD'
      }
      const req = createRequest('POST', adminToken, body)
      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Số lượng báo hỏng vượt quá lượng lưu hành còn lại')
    })
  })
})
