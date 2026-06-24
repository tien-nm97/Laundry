/**
 * @jest-environment node
 */
import { GET as getLinenTypes, POST as postLinenType } from '../app/api/admin/linen-types/route'
import { GET as getWards, POST as postWard } from '../app/api/admin/wards/route'
import { GET as getBatches, POST as postBatch } from '../app/api/admin/batches/route'
import { signToken } from '../lib/jwt'
import { prisma } from '../lib/db'

describe('Admin API Endpoints', () => {
  let adminToken: string
  let laundryToken: string

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long'
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
    laundryToken = await signToken({ userId: '2', username: 'laundry', role: 'LAUNDRY' })
  })

  afterAll(async () => {
    // Clean up test batches
    await prisma.batch.deleteMany({
      where: {
        code: { startsWith: 'TEST-BATCH-' }
      }
    })

    // Clean up test wards
    await prisma.ward.deleteMany({
      where: {
        name: { startsWith: 'Ward ' }
      }
    })

    // Clean up test linen types
    await prisma.linenType.deleteMany({
      where: {
        name: { startsWith: 'Linen Type ' }
      }
    })
  })

  const createRequest = (method: string, body?: any, token?: string) => {
    const headers: Record<string, string> = {}
    if (body) {
      headers['Content-Type'] = 'application/json'
    }
    if (token) {
      headers['Cookie'] = `token=${token}`
    }
    return new Request('http://localhost/api/admin/test', {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }) as any
  };

  describe('Authentication and Authorization Protection', () => {
    it('should reject requests with 401 if token is missing', async () => {
      const req = createRequest('GET')
      const res = await getLinenTypes(req)
      expect(res.status).toBe(401)
    })

    it('should reject requests with 403 if user is not an ADMIN', async () => {
      const req = createRequest('GET', null, laundryToken)
      const res = await getLinenTypes(req)
      expect(res.status).toBe(403)
    })

    it('should allow requests if user is an ADMIN', async () => {
      const req = createRequest('GET', null, adminToken)
      const res = await getLinenTypes(req)
      // The endpoint handler exists but returns actual data (which is 200)
      expect(res.status).toBe(200)
    })
  })

  describe('Linen Types CRUD', () => {
    it('should create and retrieve linen types', async () => {
      const uniqueName = `Linen Type ${Date.now()}`
      const createReq = createRequest('POST', { name: uniqueName, unit: 'Cái' }, adminToken)
      const createRes = await postLinenType(createReq)
      expect(createRes.status).toBe(201)

      const created = await createRes.json()
      expect(created.name).toBe(uniqueName)
      expect(created.unit).toBe('Cái')

      const getReq = createRequest('GET', null, adminToken)
      const getRes = await getLinenTypes(getReq)
      expect(getRes.status).toBe(200)

      const list = await getRes.json()
      expect(list.some((item: any) => item.name === uniqueName)).toBe(true)
    })
  })

  describe('Wards CRUD', () => {
    it('should create and retrieve wards with auto-generated qrTokens', async () => {
      const uniqueName = `Ward ${Date.now()}`
      const createReq = createRequest('POST', { name: uniqueName }, adminToken)
      const createRes = await postWard(createReq)
      expect(createRes.status).toBe(201)

      const created = await createRes.json()
      expect(created.name).toBe(uniqueName)
      expect(created.qrToken).toBeDefined()
      expect(created.qrToken.length).toBeGreaterThan(10)

      const getReq = createRequest('GET', null, adminToken)
      const getRes = await getWards(getReq)
      expect(getRes.status).toBe(200)

      const list = await getRes.json()
      expect(list.some((item: any) => item.name === uniqueName)).toBe(true)
    })
  })

  describe('Batch Imports', () => {
    it('should import new bulk batches and retrieve them', async () => {
      // Get a linen type first
      const lt = await prisma.linenType.findFirst()
      expect(lt).not.toBeNull()

      const uniqueCode = `TEST-BATCH-${Date.now()}`
      const body = {
        code: uniqueCode,
        linenTypeId: lt!.id,
        totalQuantity: 100,
        importedAt: new Date().toISOString(),
      }

      const createReq = createRequest('POST', body, adminToken)
      const createRes = await postBatch(createReq)
      expect(createRes.status).toBe(201)

      const created = await createRes.json()
      expect(created.code).toBe(uniqueCode)
      expect(created.totalQuantity).toBe(100)
      expect(created.remainingQuantity).toBe(100)

      const getReq = createRequest('GET', null, adminToken)
      const getRes = await getBatches(getReq)
      expect(getRes.status).toBe(200)

      const list = await getRes.json()
      expect(list.some((item: any) => item.code === uniqueCode)).toBe(true)
    })
  })
})
