import { SignJWT, jwtVerify } from 'jose'
import { hasPermission } from './permissions'

const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-key-at-least-32-characters-long'
const secretKey = new TextEncoder().encode(JWT_SECRET)

export interface UserJWTPayload {
  userId: string
  username: string
  role: 'ADMIN' | 'LAUNDRY' | 'SUPERVISOR'
  permissions?: string[]
}

export async function signToken(payload: UserJWTPayload, expiresIn: string = '1d'): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey)
}

export async function verifyToken(token: string): Promise<UserJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)
    return payload as unknown as UserJWTPayload
  } catch (error) {
    return null
  }
}

export async function verifyAdminRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  let token: string | undefined = undefined
  const cookieList = cookieHeader.split(';')
  for (const cookie of cookieList) {
    const [name, val] = cookie.trim().split('=')
    if (name === 'token') {
      token = val
      break
    }
  }

  if (!token) {
    return { error: 'Chưa đăng nhập', status: 401 }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { error: 'Phiên làm việc hết hạn hoặc không hợp lệ', status: 401 }
  }

  if (payload.role !== 'ADMIN') {
    return { error: 'Không có quyền truy cập', status: 403 }
  }

  return { payload }
}

export async function verifyLaundryRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  let token: string | undefined = undefined
  const cookieList = cookieHeader.split(';')
  for (const cookie of cookieList) {
    const [name, val] = cookie.trim().split('=')
    if (name === 'token') {
      token = val
      break
    }
  }

  if (!token) {
    return { error: 'Chưa đăng nhập', status: 401 }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { error: 'Phiên làm việc hết hạn hoặc không hợp lệ', status: 401 }
  }

  if (payload.role !== 'LAUNDRY') {
    return { error: 'Không có quyền truy cập', status: 403 }
  }

  return { payload }
}

export async function verifyPermission(request: Request, permission: string) {
  const cookieHeader = request.headers.get('cookie') || ''
  let token: string | undefined = undefined
  const cookieList = cookieHeader.split(';')
  for (const cookie of cookieList) {
    const [name, val] = cookie.trim().split('=')
    if (name === 'token') {
      token = val
      break
    }
  }

  if (!token) {
    return { error: 'Chưa đăng nhập', status: 401 }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { error: 'Phiên làm việc hết hạn hoặc không hợp lệ', status: 401 }
  }

  const userPerms = payload.permissions || []
  
  // Tài khoản ADMIN mặc định có tất cả quyền nếu không có trường permissions
  if (payload.role === 'ADMIN' && userPerms.length === 0) {
    return { payload }
  }

  if (!hasPermission(userPerms, permission)) {
    return { error: 'Không có quyền thực hiện thao tác này', status: 403 }
  }

  return { payload }
}
