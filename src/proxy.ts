import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from './lib/jwt'
import { hasPermission } from './lib/permissions'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth for public dispatch route and its API
  if (pathname.startsWith('/laundry/dispatch') || pathname.startsWith('/api/dispatch')) {
    return NextResponse.next()
  }

  const isProtectedAdmin = pathname.startsWith('/admin')
  const isProtectedLaundry = pathname.startsWith('/laundry')

  if (isProtectedAdmin || isProtectedLaundry) {
    const tokenCookie = request.cookies.get('token')
    const token = tokenCookie?.value

    if (!token) {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }

    const payload = await verifyToken(token)
    if (!payload) {
      const loginUrl = new URL('/login', request.url)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('token')
      return response
    }

    if (isProtectedAdmin) {
      const isDispatchRoute = pathname.startsWith('/admin/dispatch')
      const isInventoryRoute = pathname.startsWith('/admin/inventory')
      if (payload.role === 'ADMIN') {
        // Allowed
      } else if (payload.role === 'SUPERVISOR') {
        const userPerms = payload.permissions || []
        const canAccessDispatch = isDispatchRoute && (
          hasPermission(userPerms, 'supervisor:ward_history') ||
          hasPermission(userPerms, 'supervisor:laundry_aggregate') ||
          hasPermission(userPerms, 'admin:ticket') ||
          hasPermission(userPerms, 'dispatch:all')
        )
        const canAccessInventory = isInventoryRoute && (
          hasPermission(userPerms, 'supervisor:laundry_procure') ||
          hasPermission(userPerms, 'supervisor:laundry_damage') ||
          hasPermission(userPerms, 'admin:batch') ||
          hasPermission(userPerms, 'inventory:all')
        )
        if (canAccessDispatch || canAccessInventory) {
          // Allowed
        } else {
          const loginUrl = new URL('/login', request.url)
          return NextResponse.redirect(loginUrl)
        }
      } else {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
      }
    }

    if (isProtectedLaundry && payload.role !== 'LAUNDRY') {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/laundry', '/laundry/:path*'],
}
