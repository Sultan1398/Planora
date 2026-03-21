'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/ui/Logo'

export default function SignupPage() {
  const { t, toggleLocale, locale } = useLanguage()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError(t('كلمتا المرور غير متطابقتين', 'Passwords do not match'))
      return
    }

    if (password.length < 6) {
      setError(t('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters'))
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
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
            {t('إنشاء حساب جديد', 'Create Account')}
          </h1>
          <p className="text-muted text-center text-sm mb-8">
            {t('ابدأ رحلتك المالية مع بلانورا', 'Start your financial journey with Planora')}
          </p>

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
              <label className="block text-sm font-medium mb-1.5">
                {t('كلمة المرور', 'Password')}
              </label>
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

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t('تأكيد كلمة المرور', 'Confirm Password')}
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {loading ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء الحساب', 'Create Account')}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            {t('لديك حساب بالفعل؟', 'Already have an account?')}{' '}
            <Link href="/login" className="text-brand hover:underline font-medium">
              {t('تسجيل الدخول', 'Sign In')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
