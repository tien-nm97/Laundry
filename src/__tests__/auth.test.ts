/**
 * @jest-environment node
 */
import { signToken, verifyToken } from '../lib/jwt'

describe('JWT Utilities', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-at-least-thirty-two-chars-long';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('should sign and verify a payload successfully', async () => {
    const payload = { userId: '123', username: 'admin', role: 'ADMIN' };
    const token = await signToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('123');
    expect(verified?.username).toBe('admin');
    expect(verified?.role).toBe('ADMIN');
  });

  it('should return null for an invalid token', async () => {
    const verified = await verifyToken('invalid.token.here');
    expect(verified).toBeNull();
  });

  it('should return null for an expired token', async () => {
    // We can sign a token with a short expiration if signToken supports custom expiration,
    // or just test that an expired token fails. Let's make signToken accept a custom expiration option
    const payload = { userId: '456', username: 'laundry', role: 'LAUNDRY' };
    // Pass custom expiration (e.g. -1s for expired token)
    const token = await signToken(payload, '-1s');
    const verified = await verifyToken(token);
    expect(verified).toBeNull();
  });
});
