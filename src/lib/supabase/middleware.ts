import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  /** صفحات المصادقة العامة */
  const isEntryAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password')
  const isResetPasswordRoute = pathname.startsWith('/reset-password')
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdmin = user?.user_metadata?.role === 'admin'
  const defaultAuthedPath = isAdmin ? '/admin' : '/hub'
  const allowWithoutAuth = pathname === '/' || isEntryAuthRoute || isResetPasswordRoute

  if (!user && !allowWithoutAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isEntryAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = defaultAuthedPath
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = defaultAuthedPath
    return NextResponse.redirect(url)
  }

  if (user && isAdminRoute && !isAdmin) {
    const url = request.nextUrl.clone()
    url.pathname = '/hub'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
