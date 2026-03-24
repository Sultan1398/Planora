'use server'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getSiteUrl } from '@/lib/utils/url'
import { mapAuthError } from '@/lib/utils/auth-errors'

export type SendPasswordResetResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * إرسال رابط الاستعادة من الخادم حتى يُبنى `redirectTo` من متغيرات البيئة (Vercel)
 * وليس من المتصفح فقط — ويتوافق مع قائمة Redirect URLs في Supabase.
 */
export async function sendPasswordResetEmail(email: string): Promise<SendPasswordResetResult> {
  const trimmed = email.trim()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: mapAuthError('invalid email') }
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const origin = getSiteUrl()
  // مسار بسيط بدون query: بعض تدفقات Supabase تلحق `?code=` فقط؛ التوجيه النهائي يحدد في auth/callback
  const redirectTo = `${origin}/auth/callback`

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  })

  if (error) {
    return { ok: false, message: mapAuthError(error.message) }
  }

  return { ok: true }
}
