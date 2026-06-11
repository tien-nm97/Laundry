/**
 * @jest-environment node
 */
import { GET, POST, DELETE } from '../app/api/admin/orderlies/route'
import { signToken } from '../lib/jwt'
import { prisma } from '../lib/db'

describe('Admin Orderlies API', () => {
  let adminToken: string
  let orderlyId: string

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long'
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' })
  })

  const createRequest = (method: string, body?: any, token?: string, searchParams?: URLSearchParams) => {
    let url = 'http://localhost/api/admin/orderlies'
    if (searchParams) {
      url += `?${searchParams.toString()}`
    }
    const headers: Record<string, string> = {}
    if (body) headers['Content-Type'] = 'application/json'
    if (token) headers['Cookie'] = `token=${token}`
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }) as any
  }

  it('should create an orderly', async () => {
    const req = createRequest('POST', { name: 'Test Orderly A' }, adminToken)
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('Test Orderly A')
    orderlyId = data.id
  })

  it('should list all orderlies', async () => {
    const req = createRequest('GET', undefined, adminToken)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.some((o: any) => o.name === 'Test Orderly A')).toBe(true)
  })

  it('should delete an orderly', async () => {
    const params = new URLSearchParams({ id: orderlyId })
    const req = createRequest('DELETE', undefined, adminToken, params)
    const res = await DELETE(req)
    expect(res.status).toBe(200)

    const check = await prisma.staff.findUnique({ where: { id: orderlyId } })
    expect(check).toBeNull()
  })
})
