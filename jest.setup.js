import '@testing-library/jest-dom'

const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

