'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/ui/Logo'

export default function ResetPasswordPage() {
  const { t, toggleLocale, locale } = useLanguage()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isUpdated, setIsUpdated] = useState(false)

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
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setIsUpdated(true)
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
          {isUpdated ? (
            <div className="text-center space-y-4">
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h2 className="text-2xl font-bold">
                {t('تم تحديث كلمة المرور بنجاح!', 'Password updated successfully!')}
              </h2>
              <p className="text-slate-600">
                {t(
                  'يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.',
                  'You can now sign in using your new password.'
                )}
              </p>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full rounded-xl bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand-dark"
              >
                {t('الذهاب إلى تسجيل الدخول', 'Go to Sign In')}
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-center mb-1">
                {t('تعيين كلمة مرور جديدة', 'Set new password')}
              </h1>
              <p className="text-muted text-center text-sm mb-8">
                {t(
                  'أدخل كلمة المرور الجديدة ثم أكّدها لإتمام الاستعادة.',
                  'Enter your new password and confirm it to finish recovery.'
                )}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t('كلمة المرور الجديدة', 'New password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t('تأكيد كلمة المرور', 'Confirm password')}
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                    placeholder="••••••••"
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
                  {loading ? t('جاري التحديث...', 'Updating...') : t('حفظ كلمة المرور الجديدة', 'Save new password')}
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
