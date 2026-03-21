'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import { fetchDashboardYearSeries, sumDashboardYear, type DashboardPeriodPoint } from '@/lib/dashboard-analytics'
import { formatPeriodRange } from '@/lib/period'
import { formatMoney } from '@/lib/format-money'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/** محتوى تبويب التحليل — نفس منطق صفحة التحليل السابقة بدون PageHeader */
export function DashboardTabPanel() {
  const { t, locale } = useLanguage()
  const { periodKey, startDay, fiscalStartMonth } = usePeriod()
  const [series, setSeries] = useState<DashboardPeriodPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setSeries([])
      setLoading(false)
      return
    }
    try {
      const data = await fetchDashboardYearSeries(supabase, user.id, periodKey, startDay, fiscalStartMonth)
      setSeries(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSeries([])
    }
    setLoading(false)
  }, [periodKey, startDay, fiscalStartMonth])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => sumDashboardYear(series), [series])

  const rangeSubtitle = useMemo(() => {
    if (series.length === 0) return ''
    const a = formatPeriodRange(series[0].periodKey, startDay, locale)
    const b = formatPeriodRange(series[series.length - 1].periodKey, startDay, locale)
    return `${a.startLabel} — ${b.endLabel}`
  }, [series, startDay, locale])

  const maxIncomePeriod = useMemo(() => {
    if (!series.length) return null
    return series.reduce((best, p) => (p.income > best.income ? p : best), series[0])
  }, [series])

  const maxExpensePeriod = useMemo(() => {
    if (!series.length) return null
    return series.reduce((best, p) => (p.expensesPaid > best.expensesPaid ? p : best), series[0])
  }, [series])

  const avgIncome = series.length ? totals.income / series.length : 0
  const avgExpense = series.length ? totals.expensesPaid / series.length : 0

  const fmt = (n: number) => (loading ? '—' : formatMoney(n, locale))

  const tooltipFormatter = (value: unknown) => {
    if (typeof value === 'number') return formatMoney(value, locale)
    if (value == null) return ''
    return String(value)
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {rangeSubtitle ? (
        <p className="mb-4 text-sm text-muted">
          {t('نطاق التحليل:', 'Analysis range:')}{' '}
          <span className="font-medium text-slate-800 tabular-nums" dir="ltr">
            {rangeSubtitle}
          </span>
        </p>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-muted">
          {t('جارٍ تحميل التحليل…', 'Loading analytics…')}
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center text-muted">
          {t('لا توجد بيانات كافية لعرض التحليل', 'Not enough data to show analytics')}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-muted">{t('إجمالي الإيرادات (١٢ فترة)', 'Total income (12 periods)')}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600" dir="ltr">
                {fmt(totals.income)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-muted">{t('إجمالي المصروفات المدفوعة', 'Total paid expenses')}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-rose-600" dir="ltr">
                {fmt(totals.expensesPaid)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-muted">{t('صافي السيولة التراكمي', 'Net liquidity (sum of periods)')}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-brand" dir="ltr">
                {fmt(totals.liquidityNet)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-muted">{t('ربح/خسارة استثمار محققة', 'Realized investment P/L')}</p>
              <p
                className={`mt-1 text-xl font-bold tabular-nums ${totals.invRealizedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                dir="ltr"
              >
                {fmt(totals.invRealizedPL)}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              {t('حركة السيولة حسب الفترة', 'Liquidity movement by period')}
            </h2>
            <p className="text-sm text-muted mb-4">
              {t(
                'الدخل − المصروفات المدفوعة − صافي المدخرات − صافي تحويلات الاستثمار (لكل فترة)',
                'Income − paid expenses − net savings − net investment transfers (per period)'
              )}
            </p>
            <div className="h-[280px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v), locale)} width={72} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="liquidityNet"
                    name={t('صافي السيولة', 'Net liquidity')}
                    stroke="#1B6EF3"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#1B6EF3' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4">{t('مؤشرات الإيرادات', 'Income indicators')}</h2>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="text-muted">{t('المتوسط لكل فترة', 'Average per period')}</span>
                  <span className="font-bold tabular-nums text-emerald-600" dir="ltr">
                    {fmt(avgIncome)}
                  </span>
                </li>
                <li className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="text-muted">{t('أعلى فترة', 'Strongest period')}</span>
                  <span className="text-end font-bold text-slate-800">
                    {maxIncomePeriod ? (
                      <>
                        <span className="block tabular-nums text-emerald-600" dir="ltr">
                          {fmt(maxIncomePeriod.income)}
                        </span>
                        <span className="text-xs font-normal text-muted">{maxIncomePeriod.label}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-muted">{t('صافي المدخرات (السنة)', 'Net savings (year)')}</span>
                  <span className="font-bold tabular-nums text-slate-800" dir="ltr">
                    {fmt(totals.savingsNet)}
                  </span>
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4">{t('مؤشرات المصروفات', 'Expense indicators')}</h2>
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="text-muted">{t('المتوسط لكل فترة', 'Average per period')}</span>
                  <span className="font-bold tabular-nums text-rose-600" dir="ltr">
                    {fmt(avgExpense)}
                  </span>
                </li>
                <li className="flex justify-between gap-4 border-b border-border pb-3">
                  <span className="text-muted">{t('أعلى فترة إنفاقًا', 'Highest spending period')}</span>
                  <span className="text-end font-bold text-slate-800">
                    {maxExpensePeriod ? (
                      <>
                        <span className="block tabular-nums text-rose-600" dir="ltr">
                          {fmt(maxExpensePeriod.expensesPaid)}
                        </span>
                        <span className="text-xs font-normal text-muted">{maxExpensePeriod.label}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-muted">{t('إجمالي المدفوع من المحفظة', 'Total paid from wallet')}</span>
                  <span className="font-bold tabular-nums text-slate-800" dir="ltr">
                    {fmt(totals.expensesPaid)}
                  </span>
                </li>
              </ul>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              {t('مقارنة الإيرادات والمصروفات لكل فترة', 'Income vs expenses by period')}
            </h2>
            <p className="text-sm text-muted mb-4">
              {t('جميع فترات السنة المالية المعروضة', 'All periods in the displayed financial year')}
            </p>
            <div className="h-[320px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v), locale)} width={72} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Bar
                    dataKey="income"
                    name={t('الإيرادات', 'Income')}
                    fill="#1B6EF3"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="expensesPaid"
                    name={t('المصروفات (مدفوعة)', 'Expenses (paid)')}
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">{t('تحليل الاستثمار', 'Investment analysis')}</h2>
            <p className="text-sm text-muted mb-4">
              {t('مجموع ١٢ فترة: تحويلات المحفظة، فتح/إغلاق الصفقات، والربح المحقق عند الإغلاق', '12-period totals: wallet transfers, deal flows, and realized P/L')}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs text-muted">{t('إيداع للاستثمارات', 'Deposits to investments')}</p>
                <p className="mt-1 font-bold tabular-nums text-brand" dir="ltr">
                  {fmt(totals.invDeposit)}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs text-muted">{t('سحب من الاستثمارات', 'Withdrawals from investments')}</p>
                <p className="mt-1 font-bold tabular-nums text-violet-600" dir="ltr">
                  {fmt(totals.invWithdrawal)}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs text-muted">{t('فتح صفقات (من المحفظة الداخلية)', 'Deal opens (internal)')}</p>
                <p className="mt-1 font-bold tabular-nums text-slate-800" dir="ltr">
                  {fmt(totals.invDealOpen)}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs text-muted">{t('إغلاق صفقات (إلى المحفظة الداخلية)', 'Deal closes (internal)')}</p>
                <p className="mt-1 font-bold tabular-nums text-slate-800" dir="ltr">
                  {fmt(totals.invDealClose)}
                </p>
              </div>
            </div>
            <div className="mt-4 h-[220px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v), locale)} width={72} />
                  <Tooltip formatter={tooltipFormatter} />
                  <Legend />
                  <Bar dataKey="invRealizedPL" name={t('ربح/خسارة محققة', 'Realized P/L')} radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {series.map((entry, index) => (
                      <Cell
                        key={`cell-pl-${index}`}
                        fill={entry.invRealizedPL >= 0 ? '#10b981' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <p className="text-xs text-muted text-center pb-4">
            {t(
              'تُعرض السنة المالية التي تتضمن الفترة المختارة (١٢ فترة من بداية السنة حتى نهايتها). غيّر الفترة من الأعلى لعرض سنة مالية أخرى.',
              'Shows the financial year that contains the selected period (12 periods from FY start to end). Change the period above to view another FY.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
