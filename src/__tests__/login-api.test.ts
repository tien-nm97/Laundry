/**
 * @jest-environment node
 */
import { POST } from '../app/api/auth/login/route'

describe('Login API Endpoint', () => {
  it('should authenticate a valid admin user and return 200 with cookies', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.username).toBe('admin')
    expect(data.role).toBe('ADMIN')

    // Verify cookies set
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain('token=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('should reject invalid credentials with 401', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    })

    const response = await POST(request as any)
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Tên đăng nhập hoặc mật khẩu không đúng')
  })
})
