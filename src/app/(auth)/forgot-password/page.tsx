'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/ui/Logo'

export default function ForgotPasswordPage() {
  const { t, toggleLocale, locale } = useLanguage()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setIsSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-6">
          <button
            type="button"
            onClick={toggleLocale}
            className="text-sm text-muted hover:text-brand transition-colors px-3 py-1 rounded-lg border border-border"
          >
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        <div className="flex justify-center mb-8">
          <Logo size="lg" showName={false} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-8">
          {isSubmitted ? (
            <div className="text-center space-y-4">
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                <MailCheck className="h-9 w-9" />
              </div>
              <h2 className="text-2xl font-bold">
                {t('تم إرسال رابط الاستعادة!', 'Recovery link sent!')}
              </h2>
              <p className="text-slate-600">
                {t(
                  'يرجى تفقد بريدك الإلكتروني (ومجلد الرسائل غير المرغوب فيها Junk) واتباع رابط الاستعادة.',
                  'Please check your email (and Junk / Spam folder) and follow the recovery link.'
                )}
              </p>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full rounded-xl bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark"
              >
                {t('العودة لتسجيل الدخول', 'Back to Sign In')}
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-center mb-1">
                {t('استعادة كلمة المرور', 'Recover password')}
              </h1>
              <p className="text-muted text-center text-sm mb-8">
                {t(
                  'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.',
                  'Enter your email and we will send you a reset link.'
                )}
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
                    dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                    placeholder="example@email.com"
                  />
                </div>

                {error ? (
                  <div className="bg-red-50 text-danger text-sm px-4 py-3 rounded-xl border border-red-200">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand text-white py-2.5 rounded-xl font-medium hover:bg-brand-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? t('جاري الإرسال...', 'Sending...') : t('إرسال رابط الاستعادة', 'Send recovery link')}
                </button>
              </form>

              <p className="text-center text-sm text-muted mt-6">
                <Link href="/login" className="text-brand hover:underline font-medium">
                  {t('العودة لتسجيل الدخول', 'Back to Sign In')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
