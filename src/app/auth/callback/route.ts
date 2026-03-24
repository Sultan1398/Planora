import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

function sanitizeNextPath(nextRaw: string | null): string {
  // مسار الاستعادة الافتراضي إذا لم يُمرَّر `next` (مثلاً بعد إعادة توجيه Supabase)
  if (!nextRaw) return '/reset-password'
  if (!nextRaw.startsWith('/')) return '/reset-password'
  if (nextRaw.startsWith('//')) return '/reset-password'
  return nextRaw
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = sanitizeNextPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/login?error=Invalid_recovery_code`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${requestUrl.origin}/login?error=Invalid_recovery_code`)
  }

  return NextResponse.redirect(`${requestUrl.origin}${next}`)
}
