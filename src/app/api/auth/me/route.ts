import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { prisma } from '@/lib/db'
import { migratePermissions } from '@/lib/permissions'

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const cookieList = cookieHeader.split(';')
    let token = ''
    for (const cookie of cookieList) {
      const [name, val] = cookie.trim().split('=')
      if (name === 'token') {
        token = val
        break
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const migratedPerms = migratePermissions(user.permissions)
    const isChanged = user.permissions.length !== migratedPerms.length || 
                      user.permissions.some(p => !migratedPerms.includes(p))
    if (isChanged) {
      await prisma.user.update({
        where: { id: user.id },
        data: { permissions: migratedPerms }
      })
      user.permissions = migratedPerms
    }

    return NextResponse.json({
      username: user.username,
      role: user.role,
      permissions: user.permissions || [],
    })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

