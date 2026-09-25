/**
 * Middleware — protect /admin routes
 * Development: allow bypass with cookie token
 * Production: require Auth.js session
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Allow Auth.js routes and public pages.
  if (
    path.startsWith('/api/auth') ||
    path === '/admin/login' ||
    path === '/admin/error' ||
    (!path.startsWith('/admin') && !path.startsWith('/api/admin'))
  ) {
    return NextResponse.next()
  }

  // Explicit local-only escape hatch. It is deliberately opt-in and never creates a fake session.
  if (process.env.NODE_ENV !== 'production' && process.env.ADMIN_DEV_BYPASS === 'true') {
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    cookieName: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
  })
  if (token?.sessionKind !== 'admin') {
    if (path.startsWith('/api/admin')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const signInUrl = new URL('/admin/login', req.url)
    signInUrl.searchParams.set('callbackUrl', path)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
