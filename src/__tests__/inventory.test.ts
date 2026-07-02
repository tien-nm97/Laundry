/**
 * @jest-environment node
 */
import { GET } from '../app/api/admin/inventory/route'
import { POST } from '../app/api/admin/inventory/recycle/route'
import { PUT } from '../app/api/admin/inventory/min-stock/route'
import { POST as proposePOST } from '../app/api/admin/inventory/recycle/propose/route'
import { POST as approvePOST } from '../app/api/admin/inventory/recycle/approve/route'
import { POST as circulatePOST } from '../app/api/admin/inventory/circulate/route'
import { GET as transactionsGET } from '../app/api/admin/inventory/transactions/route'
import { prisma } from '../lib/db'
import { signToken } from '../lib/jwt'
import { Batch, LinenType, LinenCirculation } from '@prisma/client'

describe('Inventory & Recycling Admin APIs', () => {
  let adminToken: string
  let supervisorToken: string
  let laundrySupervisorToken: string
  let laundryToken: string
  let testBatch: Batch
  let testLinenTypeDrap: LinenType
  let testCirculation: LinenCirculation

  beforeAll(async () => {
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
    supervisorToken = await signToken({ userId: '2', username: 'supervisor', role: 'SUPERVISOR', permissions: ['admin:view'] })
    laundrySupervisorToken = await signToken({
      userId: '4',
      username: 'laundry_supervisor',
      role: 'SUPERVISOR',
      permissions: ['admin:view', 'inventory:discard', 'inventory:import', 'inventory:min_stock', 'inventory:circulate', 'inventory:view']
    })
    laundryToken = await signToken({ userId: '3', username: 'laundry', role: 'LAUNDRY' })

    // Clean up any stale test records from previous failed runs
    await prisma.linenRecycleProposal.deleteMany({
      where: { circulation: { linenType: { name: 'TEST-DRAP-1' } } }
    })
    await prisma.linenDiscardLog.deleteMany({
      where: { circulation: { linenType: { name: 'TEST-DRAP-1' } } }
    })
    await prisma.inventoryTransaction.deleteMany({
      where: { linenType: { name: 'TEST-DRAP-1' } }
    })
    await prisma.linenCirculation.deleteMany({
      where: { linenType: { name: 'TEST-DRAP-1' } }
    })
    await prisma.batch.deleteMany({
      where: { linenType: { name: 'TEST-DRAP-1' } }
    })
    await prisma.linenType.deleteMany({
      where: { name: 'TEST-DRAP-1' }
    })

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
    // Delete logs and transactions first
    await prisma.linenRecycleProposal.deleteMany({
      where: { circulation: { linenTypeId: testLinenTypeDrap.id } }
    })
    await prisma.linenDiscardLog.deleteMany({
      where: { circulation: { linenTypeId: testLinenTypeDrap.id } }
    })
    await prisma.inventoryTransaction.deleteMany({
      where: { linenTypeId: testLinenTypeDrap.id }
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

  const createRequest = (url: string, method: string, cookieToken?: string, body?: unknown) => {
    const headers: Record<string, string> = {}
    if (cookieToken) {
      headers['cookie'] = `token=${cookieToken}`
    }
    if (body) {
      headers['Content-Type'] = 'application/json'
    }
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }) as unknown as Request
  }

  describe('GET /api/admin/inventory', () => {
    it('should allow Admin and Supervisor to fetch aggregated inventory', async () => {
      const reqAdmin = createRequest('http://localhost/api/admin/inventory', 'GET', adminToken)
      const resAdmin = await GET(reqAdmin)
      expect(resAdmin.status).toBe(200)

      const dataAdmin = await resAdmin.json()
      expect(dataAdmin.inventory).toBeDefined()
      expect(dataAdmin.batches).toBeDefined()
      expect(dataAdmin.activeCirculations).toBeDefined()
      expect(dataAdmin.recycleProposals).toBeDefined()

      // Verify minStock is included in each item
      const testItem = dataAdmin.inventory.find((i: any) => i.linenTypeId === testLinenTypeDrap.id)
      expect(testItem).toBeDefined()
      expect(testItem.minStock).toBeDefined()
      expect(typeof testItem.minStock).toBe('number')

      // Test with Supervisor token
      const reqSuper = createRequest('http://localhost/api/admin/inventory', 'GET', supervisorToken)
      const resSuper = await GET(reqSuper)
      expect(resSuper.status).toBe(200)
    })

    it('should reject Laundry role with 403', async () => {
      const req = createRequest('http://localhost/api/admin/inventory', 'GET', laundryToken)
      const res = await GET(req)
      expect(res.status).toBe(403)
    })
  })

  describe('PUT /api/admin/inventory/min-stock', () => {
    it('should allow Admin and Laundry Supervisor to update minimum stock levels', async () => {
      const body = [
        { linenTypeId: testLinenTypeDrap.id, minStock: 25 }
      ]
      const req = createRequest('http://localhost/api/admin/inventory/min-stock', 'PUT', laundrySupervisorToken, body)
      const res = await PUT(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.count).toBe(1)

      const updatedType = await prisma.linenType.findUnique({
        where: { id: testLinenTypeDrap.id }
      })
      expect(updatedType?.minStock).toBe(25)
    })

    it('should reject Ward Supervisor (no laundry permissions) with 403', async () => {
      const body = [
        { linenTypeId: testLinenTypeDrap.id, minStock: 30 }
      ]
      const req = createRequest('http://localhost/api/admin/inventory/min-stock', 'PUT', supervisorToken, body)
      const res = await PUT(req)
      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/admin/inventory/recycle (legacy direct path)', () => {
    it('should perform normal discard successfully', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        discardQuantity: 5,
        action: 'DISCARD'
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle', 'POST', adminToken, body)
      const res = await POST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.updatedCirculation.activeQuantity).toBe(45)
      expect(data.updatedCirculation.discardedQuantity).toBe(5)
      expect(data.discardLog.reason).toBe('Báo hỏng thông thường')
    })

    it('should block direct recycling and return 400', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        discardQuantity: 10,
        action: 'RECYCLE',
        recycledQuantity: 20
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle', 'POST', adminToken, body)
      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('phải được thực hiện thông qua quy trình đề xuất')
    })
  })

  describe('Recycle Proposals Workflow APIs', () => {
    let proposalId: string

    it('should allow Laundry Supervisor to propose recycling', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        quantity: 10
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle/propose', 'POST', laundrySupervisorToken, body)
      const res = await proposePOST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.id).toBeDefined()
      expect(data.status).toBe('PENDING')
      expect(data.quantity).toBe(10)
      expect(data.proposerName).toBe('laundry_supervisor')
      proposalId = data.id
    })

    it('should reject propose recycle from Ward Supervisor with 403', async () => {
      const body = {
        linenCirculationId: testCirculation.id,
        quantity: 5
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle/propose', 'POST', supervisorToken, body)
      const res = await proposePOST(req)
      expect(res.status).toBe(403)
    })

    it('should reject approve recycle from Laundry Supervisor with 403', async () => {
      const body = {
        proposalId,
        action: 'APPROVED',
        recycledQuantity: 15
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle/approve', 'POST', laundrySupervisorToken, body)
      const res = await approvePOST(req)
      expect(res.status).toBe(403)
    })

    it('should allow Admin to approve recycle proposal and adjust stock', async () => {
      const body = {
        proposalId,
        action: 'APPROVED',
        recycledQuantity: 15
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle/approve', 'POST', adminToken, body)
      const res = await approvePOST(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.proposal.status).toBe('APPROVED')
      expect(data.proposal.recycledQuantity).toBe(15)
      expect(data.proposal.approverName).toBe('admin')

      // Verify Drap active circulation quantity is decremented
      expect(data.updatedCirculation.activeQuantity).toBe(35) // 45 - 10
      expect(data.updatedCirculation.discardedQuantity).toBe(15) // 5 + 10

      // Verify Pillowcase batch is created
      expect(data.newBatch).toBeDefined()
      expect(data.newBatch.totalQuantity).toBe(15)
    })

    it('should allow Admin to reject a new proposal', async () => {
      // 1. Create a new proposal
      const proposeBody = {
        linenCirculationId: testCirculation.id,
        quantity: 5
      }
      const proposeReq = createRequest('http://localhost/api/admin/inventory/recycle/propose', 'POST', adminToken, proposeBody)
      const proposeRes = await proposePOST(proposeReq)
      expect(proposeRes.status).toBe(201)
      const proposeData = await proposeRes.json()

      // 2. Reject it
      const approveBody = {
        proposalId: proposeData.id,
        action: 'REJECTED'
      }
      const approveReq = createRequest('http://localhost/api/admin/inventory/recycle/approve', 'POST', adminToken, approveBody)
      const approveRes = await approvePOST(approveReq)
      expect(approveRes.status).toBe(200)

      const approveData = await approveRes.json()
      expect(approveData.success).toBe(true)
      expect(approveData.proposal.status).toBe('REJECTED')
      expect(approveData.proposal.approverName).toBe('admin')
    })
  })

  describe('New Inventory & FIFO Improvements', () => {
    it('should allow Admin or Batch Manager to circulate a batch to active circulation', async () => {
      const body = {
        batchId: testBatch.id,
        quantity: 10
      }
      const req = createRequest('http://localhost/api/admin/inventory/circulate', 'POST', adminToken, body)
      const res = await circulatePOST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.activeQuantity).toBe(10)
      expect(data.originalQuantity).toBe(10)

      // Verify batch remaining quantity is updated
      const updatedBatch = await prisma.batch.findUnique({
        where: { id: testBatch.id }
      })
      expect(updatedBatch?.remainingQuantity).toBe(40) // 50 - 10
    })

    it('should perform direct discard automatically using FIFO when linenTypeId is passed', async () => {
      const body = {
        linenTypeId: testLinenTypeDrap.id,
        discardQuantity: 5,
        action: 'DISCARD'
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle', 'POST', adminToken, body)
      const res = await POST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('should propose recycle automatically using FIFO when linenTypeId is passed', async () => {
      const body = {
        linenTypeId: testLinenTypeDrap.id,
        quantity: 5
      }
      const req = createRequest('http://localhost/api/admin/inventory/recycle/propose', 'POST', adminToken, body)
      const res = await proposePOST(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.id).toBeDefined()
    })

    it('should allow Admin to fetch transaction logs', async () => {
      const req = createRequest('http://localhost/api/admin/inventory/transactions', 'GET', adminToken)
      const res = await transactionsGET(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].type).toBeDefined()
    })
  })
})
