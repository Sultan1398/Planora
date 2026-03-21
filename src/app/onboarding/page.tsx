'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { Logo } from '@/components/ui/Logo'
import {
  getCurrentPeriodKey,
  getFiscalYearPeriodKeys,
  getPeriodDates,
  formatGregorianDate,
  formatPeriodRange,
} from '@/lib/period'
import { MONTH_LABELS_AR_EN } from '@/lib/calendar-months'

export default function OnboardingPage() {
  const { t, locale } = useLanguage()
  const router = useRouter()
  const today = new Date()
  const [startDay, setStartDay] = useState(1)
  const [startMonth, setStartMonth] = useState(today.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const previewRefKey = useMemo(() => getCurrentPeriodKey(startDay), [startDay])
  const previewFiscalKeys = useMemo(
    () => getFiscalYearPeriodKeys(previewRefKey, startDay, startMonth),
    [previewRefKey, startDay, startMonth]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        period_start_day: startDay,
        period_start_month: startMonth,
        updated_at: new Date().toISOString(),
      })

    if (upsertError) {
      setError(upsertError.message)
      setLoading(false)
      return
    }

    router.push('/')
  }

  const { startLabel, endLabel } = formatPeriodRange(previewRefKey, startDay, locale)
  const days = Array.from({ length: 28 }, (_, i) => i + 1)

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <Logo size="xl" showName />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-border p-8">
          <h1 className="text-2xl font-bold text-center mb-2">
            {t('إعداد السنة المالية', 'Set up your financial year')}
          </h1>
          <p className="text-muted text-center text-sm mb-8">
            {t(
              'اختر اليوم والشهر اللذين تبدأ عندهما سنتك المالية (الفترة ١ … ١٢). يمكنك تعديلهما لاحقاً من الإعدادات.',
              'Choose the day and month your financial year starts (periods 1–12). You can change this later in Settings.'
            )}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="onboarding-start-day" className="block text-sm font-semibold mb-2">
                  {t('يوم البداية', 'Start day')}
                </label>
                <select
                  id="onboarding-start-day"
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted mt-1">
                  {t('١–٢٨ فقط', '1–28 only')}
                </p>
              </div>
              <div>
                <label htmlFor="onboarding-start-month" className="block text-sm font-semibold mb-2">
                  {t('شهر البداية', 'Start month')}
                </label>
                <select
                  id="onboarding-start-month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(Number(e.target.value))}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand"
                >
                  {MONTH_LABELS_AR_EN.map(([ar, en], i) => (
                    <option key={i + 1} value={i + 1}>
                      {t(ar, en)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-brand-light border border-brand/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-brand/70 uppercase tracking-wide mb-2">
                {t('فترتك الحالية (اليوم)', 'Your current period (today)')}
              </p>
              <div className="flex items-center gap-2 flex-wrap" dir="ltr">
                <span className="text-sm font-semibold text-brand">{startLabel}</span>
                <span className="text-brand/50 text-sm">→</span>
                <span className="text-sm font-semibold text-brand">{endLabel}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-muted mb-2">
                {t('ترقيم الفترات ١–١٢ (معاينة)', 'Periods 1–12 (preview)')}
              </p>
              <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto" dir="ltr">
                {previewFiscalKeys.map((key, i) => {
                  const { start, end } = getPeriodDates(key, startDay)
                  return (
                    <li key={key} className="flex flex-wrap gap-x-2 text-slate-700">
                      <span className="font-bold text-brand tabular-nums">({i + 1})</span>
                      <span className="text-muted">{key}</span>
                      <span className="tabular-nums">
                        {formatGregorianDate(start, locale)} — {formatGregorianDate(end, locale)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 text-danger text-sm px-4 py-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-3 rounded-xl font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-base"
            >
              {loading ? t('جاري الحفظ...', 'Saving...') : t('ابدأ الاستخدام', 'Get started')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
