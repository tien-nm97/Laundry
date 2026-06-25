/**
 * @jest-environment node
 */
import { proxy } from '../proxy'
import { NextRequest } from 'next/server'
import { signToken } from '../lib/jwt'

describe('Next.js Proxy Authentication', () => {
  const originalSecret = process.env.JWT_SECRET;
  let adminToken: string;
  let laundryToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long';
    adminToken = await signToken({ userId: '1', username: 'admin', role: 'ADMIN' });
    laundryToken = await signToken({ userId: '2', username: 'laundry', role: 'LAUNDRY' });
    supervisorToken = await signToken({ userId: '3', username: 'supervisor', role: 'SUPERVISOR' });
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  const createMockRequest = (urlStr: string, cookieValue?: string) => {
    const req = new NextRequest(new URL(urlStr));
    if (cookieValue) {
      req.cookies.set('token', cookieValue);
    }
    return req;
  };

  it('should redirect unauthenticated users trying to access /admin to /login', async () => {
    const req = createMockRequest('http://localhost/admin');
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307); // Temporary redirect
    expect(res?.headers.get('location')).toContain('/login');
  });

  it('should redirect unauthenticated users trying to access /laundry to /login', async () => {
    const req = createMockRequest('http://localhost/laundry');
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });

  it('should allow ADMIN users to access /admin', async () => {
    const req = createMockRequest('http://localhost/admin', adminToken);
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('should redirect LAUNDRY users trying to access /admin to /login or /laundry', async () => {
    const req = createMockRequest('http://localhost/admin', laundryToken);
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });

  it('should allow LAUNDRY users to access /laundry', async () => {
    const req = createMockRequest('http://localhost/laundry', laundryToken);
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('should redirect ADMIN users trying to access /laundry to /login or /admin', async () => {
    const req = createMockRequest('http://localhost/laundry', adminToken);
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });

  it('should bypass non-protected routes (like home / or /login)', async () => {
    const req = createMockRequest('http://localhost/login');
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    } else {
      expect(res).toBeUndefined();
    }
  });

  it('should bypass auth check for public dispatch page /laundry/dispatch', async () => {
    const req = createMockRequest('http://localhost/laundry/dispatch');
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    } else {
      expect(res).toBeUndefined();
    }
  });

  it('should allow SUPERVISOR users to access /admin/dispatch', async () => {
    const req = createMockRequest('http://localhost/admin/dispatch', supervisorToken);
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('should allow SUPERVISOR users to access /admin/inventory', async () => {
    const req = createMockRequest('http://localhost/admin/inventory', supervisorToken);
    const res = await proxy(req);
    if (res) {
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('should redirect SUPERVISOR users trying to access other /admin routes to /login', async () => {
    const req = createMockRequest('http://localhost/admin', supervisorToken);
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });

  it('should redirect SUPERVISOR users trying to access /laundry to /login', async () => {
    const req = createMockRequest('http://localhost/laundry', supervisorToken);
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });
});
