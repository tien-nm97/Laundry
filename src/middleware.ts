import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from './lib/jwt'

export async function middleware(request: NextRequest) {
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

    if (isProtectedAdmin && payload.role !== 'ADMIN') {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }

    if (isProtectedLaundry && payload.role !== 'LAUNDRY') {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/laundry/:path*'],
}
