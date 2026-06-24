import '@testing-library/jest-dom'

const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Apply polyfills only for JSDOM test environment
if (typeof window !== 'undefined') {
  const crypto = require('crypto')
  if (!global.crypto) {
    Object.defineProperty(global, 'crypto', {
      value: crypto.webcrypto,
    })
  }

  if (!global.structuredClone) {
    global.structuredClone = (val) => JSON.parse(JSON.stringify(val))
  }

  if (!global.fetch) {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    )
  }
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// Auto-disconnect Prisma database client after each test file to prevent connection leaks
afterAll(async () => {
  try {
    const { prisma } = require('./src/lib/db')
    
    // Clean up all possible test data created by tests
    try {
      await prisma.linenDiscardLog.deleteMany({
        where: {
          circulation: {
            batch: {
              OR: [
                { code: { startsWith: 'TEST-BATCH-' } },
                { code: { startsWith: 'TEST-L-BATCH-' } }
              ]
            }
          }
        }
      })
      
      await prisma.linenCirculation.deleteMany({
        where: {
          batch: {
            OR: [
              { code: { startsWith: 'TEST-BATCH-' } },
              { code: { startsWith: 'TEST-L-BATCH-' } }
            ]
          }
        }
      })
      
      await prisma.batch.deleteMany({
        where: {
          OR: [
            { code: { startsWith: 'TEST-BATCH-' } },
            { code: { startsWith: 'TEST-L-BATCH-' } }
          ]
        }
      })
      
      await prisma.ticketItem.deleteMany({
        where: {
          ticket: {
            ward: {
              name: { startsWith: 'Ward ' }
            }
          }
        }
      })
      
      await prisma.ticket.deleteMany({
        where: {
          ward: {
            name: { startsWith: 'Ward ' }
          }
        }
      })
      
      await prisma.ward.deleteMany({
        where: {
          name: { startsWith: 'Ward ' }
        }
      })
      
      await prisma.linenType.deleteMany({
        where: {
          name: { startsWith: 'Linen Type ' }
        }
      })
    } catch (cleanupErr) {
      console.error("Global afterAll db cleanup error:", cleanupErr)
    }

    await prisma.$disconnect()
    if (prisma.$pool) {
      await prisma.$pool.end()
    }
  } catch (e) {
    console.error("Global afterAll error:", e)
  }
})

