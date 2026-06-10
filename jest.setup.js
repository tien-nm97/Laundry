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

