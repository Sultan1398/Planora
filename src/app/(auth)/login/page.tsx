'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/ui/Logo'
import { mapAuthError } from '@/lib/utils/auth-errors'

function detectLoginPlatform(userAgent: string): 'Web' | 'iOS' | 'Android' {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'Android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS'
  return 'Web'
}

function LoginPageContent() {
  const { t, toggleLocale, locale } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const callbackError = searchParams.get('error')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(authError.message)

      await supabase.auth.refreshSession()
      const {
        data: { user: refreshedUser },
      } = await supabase.auth.getUser()

      if (refreshedUser) {
        const currentPlatform = detectLoginPlatform(navigator.userAgent)
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('platforms_used')
          .eq('id', refreshedUser.id)
          .maybeSingle()

        const existing = profileRow?.platforms_used ?? []
        const hasPlatform = existing.some((p) => p.toLowerCase() === currentPlatform.toLowerCase())
        if (!hasPlatform) {
          const next = [...existing, currentPlatform]
          await supabase
            .from('profiles')
            .update({
              platforms_used: next,
              used_web: currentPlatform === 'Web' ? true : undefined,
              used_android: currentPlatform === 'Android' ? true : undefined,
              used_ios: currentPlatform === 'iOS' ? true : undefined,
            })
            .eq('id', refreshedUser.id)
        }
      }

      const role = refreshedUser?.user_metadata?.role ?? data.user?.user_metadata?.role
      router.push(role === 'admin' ? '/admin' : '/hub')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(mapAuthError(message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Language Toggle */}
        <div className="flex justify-end mb-6">
          <button
            onClick={toggleLocale}
            className="text-sm text-muted hover:text-brand transition-colors px-3 py-1 rounded-lg border border-border"
          >
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-8">
          <h1 className="text-2xl font-bold text-center mb-1">
            {t('مرحباً بك في بلانورا', 'Welcome to Planora')}
          </h1>
          <p className="text-muted text-center text-sm mb-8">
            {t('سجّل دخولك لمتابعة أموالك', 'Sign in to manage your finances')}
          </p>

          {callbackError ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t(
                'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية.',
                'Password recovery link is invalid or expired.'
              )}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t('البريد الإلكتروني', 'Email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                placeholder="example@email.com"
                dir="ltr"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">
                  {t('كلمة المرور', 'Password')}
                </label>
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                  {t('نسيت كلمة المرور؟', 'Forgot password?')}
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-danger text-sm px-4 py-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-2.5 rounded-xl font-medium hover:bg-brand-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('جاري الدخول...', 'Signing in...') : t('تسجيل الدخول', 'Sign In')}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            {t('ليس لديك حساب؟', "Don't have an account?")}{' '}
            <Link href="/signup" className="text-brand hover:underline font-medium">
              {t('إنشاء حساب', 'Sign Up')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface px-4 text-sm text-muted">
          جاري التحميل...
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
