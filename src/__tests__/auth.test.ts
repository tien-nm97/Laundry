/**
 * @jest-environment node
 */
import { signToken, verifyToken, verifyPermission } from '../lib/jwt'

describe('JWT Utilities', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('should sign and verify a payload successfully', async () => {
    const payload = { userId: '123', username: 'admin', role: 'ADMIN' as const, permissions: ['admin:users'] };
    const token = await signToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('123');
    expect(verified?.username).toBe('admin');
    expect(verified?.role).toBe('ADMIN');
    expect(verified?.permissions).toContain('admin:users');
  });

  it('should verify permission correctly using verifyPermission', async () => {
    const payload = { 
      userId: '789', 
      username: 'customuser', 
      role: 'LAUNDRY' as const,
      permissions: ['laundry:view']
    };
    const token = await signToken(payload);
    
    const reqWithPermission = new Request('http://localhost', {
      headers: { cookie: `token=${token}` }
    });
    const authCheck = await verifyPermission(reqWithPermission, 'laundry:view');
    expect(authCheck.error).toBeUndefined();
    expect(authCheck.payload?.userId).toBe('789');

    const reqWithoutPermission = new Request('http://localhost', {
      headers: { cookie: `token=${token}` }
    });
    const authCheckFail = await verifyPermission(reqWithoutPermission, 'admin:users');
    expect(authCheckFail.error).toBe('Không có quyền thực hiện thao tác này');
    expect(authCheckFail.status).toBe(403);
  });

  it('should return null for an invalid token', async () => {
    const verified = await verifyToken('invalid.token.here');
    expect(verified).toBeNull();
  });

  it('should return null for an expired token', async () => {
    const payload = { userId: '456', username: 'laundry', role: 'LAUNDRY' as const };
    const token = await signToken(payload, '-1s');
    const verified = await verifyToken(token);
    expect(verified).toBeNull();
  });

  it('should sign and verify a payload successfully for SUPERVISOR', async () => {
    const payload = { userId: '111', username: 'supervisor', role: 'SUPERVISOR' as const, permissions: ['admin:view'] };
    const token = await signToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('111');
    expect(verified?.username).toBe('supervisor');
    expect(verified?.role).toBe('SUPERVISOR');
    expect(verified?.permissions).toContain('admin:view');
  });
});
