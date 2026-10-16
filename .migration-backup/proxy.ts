import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, decodeSession } from '@/lib/auth/token'
import { ADMIN_COOKIE_NAME, decodeAdminSession } from '@/lib/auth/admin-token'

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/portal')) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = token ? decodeSession(token) : null
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value
    const session = token ? decodeAdminSession(token) : null
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin-login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*', '/admin/:path*'],
}
