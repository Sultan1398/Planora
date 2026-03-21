'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import {
  getCurrentPeriodKey,
  getFiscalYearPeriodKeys,
  getPeriodDates,
  formatGregorianDate,
  formatPeriodRange,
} from '@/lib/period'
import { MONTH_LABELS_AR_EN } from '@/lib/calendar-months'
import { CheckCircle, Languages } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { ClearDataSection } from '@/components/settings/ClearDataSection'

const settingsNav = getAppNavItem('/settings')

export default function SettingsPage() {
  const { t, locale, toggleLocale } = useLanguage()
  const { startDay, fiscalStartMonth, applySavedPeriodProfile } = usePeriod()

  const [selectedDay, setSelectedDay] = useState(startDay)
  const [selectedMonth, setSelectedMonth] = useState(fiscalStartMonth)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSelectedDay(startDay)
    setSelectedMonth(fiscalStartMonth)
  }, [startDay, fiscalStartMonth])

  const previewRefKey = useMemo(
    () => getCurrentPeriodKey(selectedDay),
    [selectedDay]
  )

  const previewFiscalKeys = useMemo(
    () => getFiscalYearPeriodKeys(previewRefKey, selectedDay, selectedMonth),
    [previewRefKey, selectedDay, selectedMonth]
  )

  const hasChanged = selectedDay !== startDay || selectedMonth !== fiscalStartMonth

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError(t('يرجى تسجيل الدخول مجدداً', 'Please sign in again'))
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        period_start_day: selectedDay,
        period_start_month: selectedMonth,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    applySavedPeriodProfile(selectedDay, selectedMonth, startDay)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const days = Array.from({ length: 28 }, (_, i) => i + 1)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        nav={settingsNav}
        subtitle={t('إدارة إعدادات حسابك', 'Manage your account settings')}
      />

      {/* Financial year start */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold">
            {t('بداية السنة المالية', 'Financial year start')}
          </h2>
          <p className="text-muted text-sm mt-1">
            {t(
              'حدد اليوم والشهر اللذين تبدأ عندهما السنة المالية. تُرقّم الفترات من ١ إلى ١٢ ثم تبدأ السنة التالية.',
              'Pick the day and month your financial year begins. Periods are numbered 1–12, then the next year starts.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label htmlFor="settings-start-day" className="block text-sm font-semibold mb-2">
              {t('يوم البداية', 'Start day')}
            </label>
            <select
              id="settings-start-day"
              value={selectedDay}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              {t('١–٢٨ فقط (لتفادي تعارض أطوال الشهور)', '1–28 only (avoids month-length issues)')}
            </p>
          </div>
          <div>
            <label htmlFor="settings-start-month" className="block text-sm font-semibold mb-2">
              {t('شهر البداية', 'Start month')}
            </label>
            <select
              id="settings-start-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              {MONTH_LABELS_AR_EN.map(([ar, en], i) => (
                <option key={i + 1} value={i + 1}>
                  {t(ar, en)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 mb-5 border border-border">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            {t('معاينة الفترات الاثني عشر (للسنة المالية التي تحتوي اليوم)', '12-period preview (FY containing today)')}
          </p>
          <ul className="space-y-2 max-h-56 overflow-y-auto text-sm">
            {previewFiscalKeys.map((key, i) => {
              const { start, end } = getPeriodDates(key, selectedDay)
              const a = formatGregorianDate(start, locale)
              const b = formatGregorianDate(end, locale)
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/80 pb-2 last:border-0 last:pb-0"
                  dir="ltr"
                >
                  <span className="font-bold text-brand tabular-nums shrink-0">({i + 1})</span>
                  <span className="text-muted tabular-nums text-xs shrink-0">{key}</span>
                  <span className="text-slate-800 font-medium tabular-nums min-w-0">
                    {a} — {b}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="bg-brand-light/40 rounded-xl p-4 mb-5 border border-brand/15">
          <p className="text-xs font-semibold text-brand/80 uppercase tracking-wide mb-2">
            {t('فترتك الحالية (بعد الحفظ إن غيّرت اليوم)', 'Your current period (after save if day changed)')}
          </p>
          <div className="flex items-center gap-2 flex-wrap" dir="ltr">
            {(() => {
              const { startLabel, endLabel } = formatPeriodRange(previewRefKey, selectedDay, locale)
              return (
                <>
                  <span className="text-sm font-semibold text-brand">{startLabel}</span>
                  <span className="text-brand/50 text-sm">→</span>
                  <span className="text-sm font-semibold text-brand">{endLabel}</span>
                </>
              )
            })()}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-danger text-sm px-4 py-3 rounded-xl border border-red-200 mb-4">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanged}
            className="px-6 py-2.5 bg-brand text-white rounded-xl font-medium hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('جاري الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save changes')}
          </button>

          {saved && (
            <div className="flex items-center gap-1.5 text-success text-sm font-medium">
              <CheckCircle size={16} />
              <span>{t('تم الحفظ بنجاح', 'Saved successfully')}</span>
            </div>
          )}

          {hasChanged && !saving && (
            <button
              type="button"
              onClick={() => {
                setSelectedDay(startDay)
                setSelectedMonth(fiscalStartMonth)
              }}
              className="px-4 py-2.5 text-muted hover:text-foreground text-sm transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          )}
        </div>
      </div>

      <ClearDataSection />

      {/* Language — النص يمين (بداية السطر في RTL)، الزر يسار البطاقة */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold mb-1">{t('اللغة', 'Language')}</h2>
            <p className="text-muted text-sm">
              {t('تبديل واجهة التطبيق بين العربية والإنجليزية', 'Switch the app UI between Arabic and English')}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleLocale}
            className={cn(
              'flex shrink-0 items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold transition-all',
              'border border-border bg-surface hover:bg-brand-light text-slate-800',
              'w-full sm:w-auto self-end sm:self-auto'
            )}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50">
              <Languages size={20} className="text-cyan-600" strokeWidth={2.1} />
            </span>
            <span>{locale === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
