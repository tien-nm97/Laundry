/**
 * @jest-environment node
 */
import { prisma } from '../lib/db'
import { signToken } from '../lib/jwt'
import { GET, POST, PUT, DELETE } from '../app/api/admin/users/route'
import { NextRequest } from 'next/server'

describe('Users Administration API', () => {
  let adminToken: string
  let laundryToken: string
  let testUser: any

  beforeAll(async () => {
    adminToken = await signToken({
      userId: 'admin-id-123',
      username: 'superadmin',
      role: 'ADMIN',
      permissions: ['admin:users']
    })

    laundryToken = await signToken({
      userId: 'laundry-id-123',
      username: 'laundrystaff',
      role: 'LAUNDRY',
      permissions: ['laundry:view']
    })

    // Clean up any leftover test user to prevent "username already exists" errors
    await prisma.user.deleteMany({
      where: { username: 'newtestuser' }
    })
  })

  afterAll(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  const createRequest = (method: string, body?: any, token?: string, searchParams?: string) => {
    const url = `http://localhost/api/admin/users${searchParams ? '?' + searchParams : ''}`
    const req = new NextRequest(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (token) {
      req.cookies.set('token', token)
    }
    return req
  }

  it('should reject access to users list if unauthorized', async () => {
    const req = createRequest('GET', undefined, laundryToken)
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('should allow admin to create a new user with permissions', async () => {
    const body = {
      username: 'newtestuser',
      password: 'password123',
      role: 'LAUNDRY',
      permissions: ['laundry:view']
    }
    const req = createRequest('POST', body, adminToken)
    const res = await POST(req)
    expect(res.status).toBe(201)
    testUser = await res.json()
    expect(testUser.username).toBe('newtestuser')
    expect(testUser.permissions).toContain('laundry:view')
  })

  it('should reject creating user with duplicate username', async () => {
    const body = {
      username: 'newtestuser',
      password: 'password123',
      role: 'LAUNDRY'
    }
    const req = createRequest('POST', body, adminToken)
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('should reject creating user with short password', async () => {
    const body = {
      username: 'shortuser',
      password: '123',
      role: 'LAUNDRY'
    }
    const req = createRequest('POST', body, adminToken)
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('should allow admin to update user permissions', async () => {
    const body = {
      id: testUser.id,
      permissions: ['laundry:view', 'admin:view']
    }
    const req = createRequest('PUT', body, adminToken)
    const res = await PUT(req)
    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.permissions).toContain('admin:view')
  })

  it('should allow admin to update user username', async () => {
    const body = {
      id: testUser.id,
      username: 'updatedtestuser'
    }
    const req = createRequest('PUT', body, adminToken)
    const res = await PUT(req)
    expect(res.status).toBe(200)
    const updated = await res.json()
    expect(updated.username).toBe('updatedtestuser')
    testUser.username = 'updatedtestuser' // Cập nhật tên cục bộ để clean up đúng ở afterAll
  })

  it('should reject updating username to an already existing username', async () => {
    const bodyCreate = {
      username: 'anotheruser',
      password: 'password123',
      role: 'LAUNDRY'
    }
    const reqCreate = createRequest('POST', bodyCreate, adminToken)
    const resCreate = await POST(reqCreate)
    expect(resCreate.status).toBe(201)
    const anotherUser = await resCreate.json()

    const bodyUpdate = {
      id: testUser.id,
      username: 'anotheruser'
    }
    const reqUpdate = createRequest('PUT', bodyUpdate, adminToken)
    const resUpdate = await PUT(reqUpdate)
    expect(resUpdate.status).toBe(400)
    const errData = await resUpdate.json()
    expect(errData.error).toBe('Tên đăng nhập đã tồn tại')

    const reqDel = createRequest('DELETE', undefined, adminToken, `id=${anotherUser.id}`)
    await DELETE(reqDel)
  })

  it('should reject admin self-demotion of admin:users permission', async () => {
    const body = {
      id: 'admin-id-123',
      permissions: ['admin:view'] // thiếu admin:users
    }
    const req = createRequest('PUT', body, adminToken)
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('should reject admin self-deletion', async () => {
    const req = createRequest('DELETE', undefined, adminToken, 'id=admin-id-123')
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
