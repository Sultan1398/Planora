'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import { fetchYearStatisticsRows, sumYearStatisticsRows, type YearStatisticsRow } from '@/lib/year-statistics'
import { formatPeriodRange } from '@/lib/period'
import { formatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'

/** ألوان أرقام الجدول حسب نوع العمود */
type StatisticsMoneyColumn =
  | 'income'
  | 'expense'
  | 'obligation'
  | 'invDeposit'
  | 'invProfit'
  | 'invWithdrawal'
  | 'savDeposit'
  | 'savWithdrawal'

function statisticsMoneyClass(column: StatisticsMoneyColumn, value: number): string {
  switch (column) {
    case 'income':
    case 'invWithdrawal':
    case 'savWithdrawal':
      return 'text-emerald-600'
    case 'expense':
    case 'obligation':
      return 'text-rose-600'
    case 'invDeposit':
    case 'savDeposit':
      return 'text-brand'
    case 'invProfit':
      if (value > 0) return 'text-emerald-600'
      if (value < 0) return 'text-rose-600'
      return 'text-slate-800'
    default:
      return 'text-slate-800'
  }
}

function MoneyCell({ value, column }: { value: number; column: StatisticsMoneyColumn }) {
  const { locale } = useLanguage()
  const cls = statisticsMoneyClass(column, value)
  return (
    <td className={cn('px-3 py-2.5 text-center align-middle tabular-nums font-medium', cls)} dir="ltr">
      {formatMoney(value, locale)}
    </td>
  )
}

/** محتوى تبويب إحصاءات العام — نفس منطق صفحة الإحصاءات السابقة بدون PageHeader */
export function StatisticsTabPanel() {
  const { t, locale } = useLanguage()
  const { periodKey, startDay, fiscalStartMonth } = usePeriod()
  const [rows, setRows] = useState<YearStatisticsRow[]>([])
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
      setRows([])
      setLoading(false)
      return
    }
    try {
      const data = await fetchYearStatisticsRows(supabase, user.id, periodKey, startDay, fiscalStartMonth)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    }
    setLoading(false)
  }, [periodKey, startDay, fiscalStartMonth])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => sumYearStatisticsRows(rows), [rows])

  const columns = useMemo(
    () => [
      {
        key: 'period' as const,
        labelAr: 'الفترة (١–١٢)',
        labelEn: 'Period (1–12)',
      },
      { key: 'income' as const, labelAr: 'الدخل', labelEn: 'Income' },
      { key: 'expenses' as const, labelAr: 'المصروفات', labelEn: 'Expenses' },
      { key: 'obligations' as const, labelAr: 'الالتزامات المدفوعة', labelEn: 'Paid Obligations' },
      { key: 'invDep' as const, labelAr: 'إيداع استثمار', labelEn: 'Inv/Deposit' },
      { key: 'invProfit' as const, labelAr: 'ربح استثمار', labelEn: 'Inv/Profit' },
      { key: 'invWdr' as const, labelAr: 'سحب استثمار', labelEn: 'Inv/Withdrawal' },
      { key: 'savDep' as const, labelAr: 'إيداع ادخار', labelEn: 'Sav/Deposit' },
      { key: 'savWdr' as const, labelAr: 'سحب ادخار', labelEn: 'Sav/Withdrawal' },
    ],
    []
  )

  return (
    <div className="w-full max-w-[90rem] mx-auto">
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-12 text-center text-muted">
          {t('جارٍ التحميل…', 'Loading…')}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-surface border-b border-border">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-3 text-center font-medium text-muted whitespace-nowrap ${col.key === 'period' ? 'min-w-[300px]' : ''}`}
                    >
                      {t(col.labelAr, col.labelEn)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                      {t('لا توجد بيانات في هذا النطاق', 'No data in this range')}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, rowIndex) => {
                    const { startLabel, endLabel } = formatPeriodRange(r.periodKey, startDay, locale)
                    const periodNo = rowIndex + 1
                    return (
                      <tr key={r.periodKey} className="hover:bg-surface/60 transition-colors">
                        <td className="px-3 py-2.5 align-middle">
                          <div
                            className="mx-auto flex w-full max-w-[19rem] flex-wrap items-center justify-center gap-3 [unicode-bidi:isolate] sm:max-w-none sm:flex-nowrap"
                            dir="ltr"
                          >
                            <div
                              className="grid w-full min-w-[13rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-xs tabular-nums sm:w-[15.5rem]"
                              role="group"
                              aria-label={t(
                                `${startLabel} إلى ${endLabel}`,
                                `${startLabel} to ${endLabel}`
                              )}
                            >
                              <span className="text-end font-semibold leading-tight text-slate-700">
                                {startLabel}
                              </span>
                              <span
                                className="w-4 shrink-0 text-center text-[0.7rem] font-semibold leading-none text-muted"
                                aria-hidden
                              >
                                —
                              </span>
                              <span className="text-start font-semibold leading-tight text-slate-700">
                                {endLabel}
                              </span>
                            </div>
                            <span
                              className={cn(
                                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                                'bg-brand text-sm font-bold tabular-nums text-white shadow-md',
                                'ring-2 ring-inset ring-white/30'
                              )}
                            >
                              {periodNo}
                            </span>
                          </div>
                        </td>
                        <MoneyCell value={r.income} column="income" />
                        <MoneyCell value={r.generalExpensesPaid} column="expense" />
                        <MoneyCell value={r.obligationPaymentsPaid} column="obligation" />
                        <MoneyCell value={r.invDeposit} column="invDeposit" />
                        <MoneyCell value={r.invRealizedProfit} column="invProfit" />
                        <MoneyCell value={r.invWithdrawal} column="invWithdrawal" />
                        <MoneyCell value={r.savDeposit} column="savDeposit" />
                        <MoneyCell value={r.savWithdrawal} column="savWithdrawal" />
                      </tr>
                    )
                  })
                )}
                {rows.length > 0 ? (
                  <tr className="bg-surface/80 border-t-2 border-border font-bold">
                    <td className="px-3 py-3 text-center align-middle text-slate-900">{t('الإجمالي', 'Total')}</td>
                    <MoneyCell value={totals.income} column="income" />
                    <MoneyCell value={totals.generalExpensesPaid} column="expense" />
                    <MoneyCell value={totals.obligationPaymentsPaid} column="obligation" />
                    <MoneyCell value={totals.invDeposit} column="invDeposit" />
                    <MoneyCell value={totals.invRealizedProfit} column="invProfit" />
                    <MoneyCell value={totals.invWithdrawal} column="invWithdrawal" />
                    <MoneyCell value={totals.savDeposit} column="savDeposit" />
                    <MoneyCell value={totals.savWithdrawal} column="savWithdrawal" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && rows.length > 0 ? (
        <p className="mt-3 text-xs text-muted text-center">
          {t(
            'المصروفات = المصروفات العامة المدفوعة فقط. سداد الالتزامات في العمود المنفصل. ربح الاستثمار = صفقات أُغلقت في الفترة (حسب تاريخ الإغلاق).',
            'Expenses = paid general outflows only. Obligations are separate. Inv profit = deals closed in the period (by close date).'
          )}
        </p>
      ) : null}
    </div>
  )
}
