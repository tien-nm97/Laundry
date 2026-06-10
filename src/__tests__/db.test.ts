/**
 * @jest-environment node
 */
import { prisma } from '../lib/db'

describe('Database Connection Test', () => {
  it('should query LinenType table without errors', async () => {
    const types = await prisma.linenType.findMany();
    expect(Array.isArray(types)).toBe(true);
  });
});
