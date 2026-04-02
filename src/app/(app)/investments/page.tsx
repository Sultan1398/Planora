'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Investment } from '@/types/database'
import { computeInvestmentInternalBalance } from '@/lib/investment-ledger'
import { computeWalletCashNow } from '@/lib/cash-liquidity'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { format } from 'date-fns'
import { InvestmentWalletTransferModal } from '@/components/investments/InvestmentWalletTransferModal'
import { InvestmentDealModal } from '@/components/investments/InvestmentDealModal'
import { InvestmentCloseModal } from '@/components/investments/InvestmentCloseModal'
import { InvestmentActivityLogModal } from '@/components/investments/InvestmentActivityLogModal'
import {
  Pencil,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  Loader2,
  Power,
  ScrollText,
  LineChart,
  RotateCcw,
} from 'lucide-react'
import { ChartLineUp, Plus as PhosphorPlus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAvailableCash } from '@/hooks/useAvailableCash'

const investmentsNav = getAppNavItem('/investments')

export default function InvestmentsPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [investments, setInvestments] = useState<Investment[]>([])

  const [walletNow, setWalletNow] = useState<number | null>(null)
  const [internalNow, setInternalNow] = useState<number | null>(null)
  const [walletDepositsTotal, setWalletDepositsTotal] = useState(0)
  const [walletWithdrawalsTotal, setWalletWithdrawalsTotal] = useState(0)
  const { availableCash, loading: cashLoading } = useAvailableCash({ periodKey, periodDates, startDay })

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setInvestments([])
      setWalletNow(null)
      setInternalNow(null)
      setWalletDepositsTotal(0)
      setWalletWithdrawalsTotal(0)
      setLoading(false)
      return
    }

    const [invRes, walletTxRes, w, i] = await Promise.all([
      supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('investment_wallet_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .in('type', ['deposit', 'withdrawal']),
      computeWalletCashNow(supabase, user.id),
      computeInvestmentInternalBalance(supabase, user.id),
    ])

    if (invRes.error || walletTxRes.error) {
      setError(invRes.error?.message ?? walletTxRes.error?.message ?? '')
      setInvestments([])
      setWalletNow(null)
      setInternalNow(null)
      setWalletDepositsTotal(0)
      setWalletWithdrawalsTotal(0)
      setLoading(false)
      return
    }

    let depositTotal = 0
    let withdrawalTotal = 0
    for (const row of walletTxRes.data ?? []) {
      const amount = Number(row.amount)
      if (row.type === 'deposit') depositTotal += amount
      if (row.type === 'withdrawal') withdrawalTotal += amount
    }

    setInvestments((invRes.data as Investment[] | null) ?? [])
    setWalletNow(w)
    setInternalNow(i)
    setWalletDepositsTotal(depositTotal)
    setWalletWithdrawalsTotal(withdrawalTotal)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    const id = setTimeout(() => {
      if (!cancelled) void reload()
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [reload, periodDates.start, periodDates.end])

  const openDeals = useMemo(() => investments.filter((x) => x.status === 'open'), [investments])
  const closedDeals = useMemo(() => investments.filter((x) => x.status === 'closed'), [investments])

  const sortedDeals = useMemo(
    () =>
      [...investments].sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1
        if (a.status !== 'open' && b.status === 'open') return 1
        return 0
      }),
    [investments]
  )
  const portfolioValue = useMemo(() => openDeals.reduce((sum, d) => sum + Number(d.entry_amount || 0), 0), [openDeals])
  const liquidityCash = internalNow ?? 0

  const minD = useMemo(() => dateToLocalISODate(periodDates.start), [periodDates.start])
  const maxD = useMemo(() => dateToLocalISODate(periodDates.end), [periodDates.end])
  const profitLossInPeriod = useMemo(() => {
    let sum = 0
    for (const d of closedDeals) {
      if (!d.exit_date) continue
      const exit = d.exit_date
      if (exit < minD || exit > maxD) continue

      const entry = Number(d.entry_amount)
      const exitAmount = Number(d.exit_amount ?? 0)
      sum += exitAmount - entry
    }
    return sum
  }, [closedDeals, minD, maxD])
  const totalProfit = profitLossInPeriod
  const investmentWalletBalance = portfolioValue + liquidityCash

  function investmentPathMeta(type: Investment['type']) {
    /** يطابق DEAL_CATEGORIES في InvestmentDealModal: فوركس→other، عقار→partnership، مشاريع→freelance */
    switch (type) {
      case 'stocks':
        return { label: t('أسهم', 'Stocks'), badgeClassName: 'bg-blue-50 text-blue-600 border-blue-100' }
      case 'partnership':
        return { label: t('عقار', 'Real estate'), badgeClassName: 'bg-orange-50 text-orange-600 border-orange-100' }
      case 'freelance':
        return { label: t('مشاريع', 'Projects'), badgeClassName: 'bg-red-50 text-red-600 border-red-100' }
      case 'other':
      default:
        return { label: t('فوركس', 'Forex'), badgeClassName: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
    }
  }

  const [transferOpen, setTransferOpen] = useState(false)
  const [transferMode, setTransferMode] = useState<'deposit' | 'withdrawal'>('deposit')

  const [dealModalOpen, setDealModalOpen] = useState(false)
  const [dealModalMode, setDealModalMode] = useState<'create' | 'edit'>('create')
  const [dealEditing, setDealEditing] = useState<Investment | null>(null)

  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [dealClosing, setDealClosing] = useState<Investment | null>(null)

  const [activityLogOpen, setActivityLogOpen] = useState(false)

  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openNewDeal() {
    setDealModalMode('create')
    setDealEditing(null)
    setDealModalOpen(true)
  }

  function openEditDeal(d: Investment) {
    setDealModalMode('edit')
    setDealEditing(d)
    setDealModalOpen(true)
  }

  function openCloseDeal(d: Investment) {
    setDealClosing(d)
    setCloseModalOpen(true)
  }

  // (1) إلغاء الإغلاق: حذف deal_close ثم إعادة الصفقة إلى open
  async function cancelCloseDeal(inv: Investment) {
    if (
      !confirm(
        t(
          'إلغاء إغلاق هذه الصفقة؟ سيتم حذف عملية الإغلاق وإرجاعها إلى الصفقات المفتوحة.',
          'Cancel close for this deal? The close transaction will be removed and the deal will return to open.'
        )
      )
    )
      return

    setCancellingId(inv.id)
    const supabase = createClient()

    const { error: delTxErr } = await supabase
      .from('investment_wallet_transactions')
      .delete()
      .eq('investment_id', inv.id)
      .eq('type', 'deal_close')

    if (delTxErr) {
      setCancellingId(null)
      alert(delTxErr.message)
      return
    }

    const { error: upErr } = await supabase
      .from('investments')
      .update({ status: 'open', exit_amount: null, exit_date: null })
      .eq('id', inv.id)

    setCancellingId(null)

    if (upErr) {
      alert(upErr.message)
      return
    }

    reload()
  }

  // (3) حذف الصفقة المفتوحة فقط (ستُرجع الأموال داخلياً عبر ON DELETE CASCADE)
  async function deleteOpenDeal(inv: Investment) {
    if (
      !confirm(
        t(
          'حذف الصفقة المفتوحة؟ سيتم حذفها وإرجاع الأموال إلى محفظة الاستثمارات.',
          'Delete this open deal? Funds will be returned to the investments wallet.'
        )
      )
    )
      return

    setDeletingId(inv.id)
    const supabase = createClient()

    const { error: delErr } = await supabase.from('investments').delete().eq('id', inv.id)

    setDeletingId(null)

    if (delErr) {
      alert(delErr.message)
      return
    }

    reload()
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        nav={investmentsNav}
        subtitle={t('إدارة الاستثمارات وفتح/إغلاق الصفقات', 'Manage investments and open/close deals')}
        actions={<PeriodNavigator />}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted">
          {t('جارٍ التحميل…', 'Loading…')}
        </div>
      ) : (
        <>
          {!cashLoading && availableCash != null ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1B6EF3] bg-[#1B6EF3] px-4 py-3 shadow-sm">
              <span className="text-sm text-white">{t('السيولة المتاحة في الفترة', 'Available liquidity this period')}</span>
              <span className="text-lg font-bold text-white tabular-nums" dir="ltr">
                {formatMoney(availableCash, locale)}
              </span>
            </div>
          ) : null}

          {/* محفظة الاستثمارات ولوحة الإجماليات */}
          <div className="mb-10 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02]">
            {/* الجزء العلوي: الرصيد والأزرار */}
            <div className="relative flex flex-col justify-between gap-4 bg-gradient-to-b from-blue-50/40 to-white p-5 md:flex-row md:items-center">
              <div className="pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full bg-blue-100/50 blur-2xl" />
              <div className="relative flex flex-col items-start">
                <div className="mb-2 flex items-center gap-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 ring-1 ring-violet-100">
                    <LineChart className="h-5 w-5 text-violet-700" aria-hidden />
                  </div>
                  <h2 className="text-sm font-bold text-gray-500">
                    {t('رصيد محفظة الاستثمار', 'Investment Wallet Balance')}
                  </h2>
                </div>
                <div className="mt-2 flex items-baseline gap-x-2">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl" dir="ltr">
                    {formatMoney(investmentWalletBalance, locale)}
                  </span>
                </div>
              </div>

              <div className="relative mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center md:mt-0">
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode('withdrawal')
                    setTransferOpen(true)
                  }}
                  className="flex items-center justify-center gap-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                  {t('سحب', 'Withdraw')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode('deposit')
                    setTransferOpen(true)
                  }}
                  className="flex items-center justify-center gap-x-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
                >
                  <ArrowDownLeft className="h-5 w-5" aria-hidden />
                  {t('إيداع', 'Deposit')}
                </button>
              </div>
            </div>

            {/* الجزء السفلي: إجماليات الاستثمارات — ألوان بنفسجية كقسم الاستثمار، بدون فواصل عمودية */}
            <div className="grid grid-cols-1 border-t border-gray-100 bg-white sm:grid-cols-3">
              <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
                <p className="text-sm font-medium text-violet-600">{t('قيمة المحفظة الاستثمارية', 'Portfolio Value')}</p>
                <p className="mt-2 text-2xl font-bold text-violet-700" dir="ltr">
                  {formatMoney(portfolioValue, locale)}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
                <p className="text-sm font-medium text-violet-600">{t('السيولة النقدية', 'Cash Liquidity')}</p>
                <p className="mt-2 text-2xl font-bold text-violet-700" dir="ltr">
                  {formatMoney(liquidityCash, locale)}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-4 text-center">
                <p className="text-sm font-medium text-violet-600">{t('الربح/الخسارة', 'Profit/Loss')}</p>
                <p
                  className={cn(
                    'mt-2 text-2xl font-bold',
                    totalProfit >= 0 ? 'text-violet-700' : 'text-red-600'
                  )}
                  dir="ltr"
                >
                  {totalProfit > 0 ? '+' : ''}
                  {formatMoney(totalProfit, locale)}
                </p>
              </div>
            </div>
          </div>

          <div className={cn('flex flex-col gap-8', locale === 'ar' ? 'text-right' : 'text-left')}>
            {/* قسم جميع الصفقات */}
            <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                    <ChartLineUp weight="duotone" className="h-6 w-6 text-indigo-600" aria-hidden />
                  </div>
                  <h2 className="text-lg font-bold text-[#1F2937]">{t('سجل الصفقات', 'Deals Log')}</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActivityLogOpen(true)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-surface"
                  >
                    <ScrollText className="h-4 w-4 text-brand" aria-hidden />
                    {t('سجل الفترة', 'Activity log')}
                  </button>
                  <button
                    type="button"
                    onClick={openNewDeal}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
                  >
                    <PhosphorPlus weight="bold" className="h-4 w-4" aria-hidden />
                    {t('صفقة جديدة', 'New Deal')}
                  </button>
                </div>
              </div>

              <div className="mt-2 w-full overflow-x-auto border-t border-gray-100">
                {sortedDeals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
                    <ChartLineUp weight="duotone" className="mb-4 h-16 w-16 text-gray-200" aria-hidden />
                    <p className="mb-5 font-medium">{t('لا توجد صفقات مسجلة.', 'No deals registered.')}</p>
                    <button
                      type="button"
                      onClick={openNewDeal}
                      className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      {t('+ أضف صفقتك الأولى', '+ Add your first deal')}
                    </button>
                  </div>
                ) : (
                  <table className="w-full min-w-[900px] text-start text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
                        <th className="px-4 py-3">{t('المسار', 'Path')}</th>
                        <th className="px-4 py-3">{t('الاستثمار', 'Investment')}</th>
                        <th className="px-4 py-3">{t('تاريخ الفتح', 'Open Date')}</th>
                        <th className="px-4 py-3">{t('قيمة الفتح', 'Open Value')}</th>
                        <th className="px-4 py-3">{t('تاريخ الإغلاق', 'Close Date')}</th>
                        <th className="px-4 py-3">{t('قيمة الإغلاق', 'Close Value')}</th>
                        <th className="px-4 py-3">{t('الربح/الخسارة', 'P/L')}</th>
                        <th className="px-4 py-3 text-center">{t('الإجراءات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDeals.map((deal) => {
                        const isOpen = deal.status === 'open'
                        const path = investmentPathMeta(deal.type)
                        const entryAmount = Number(deal.entry_amount || 0)
                        const exitAmount = deal.exit_amount == null ? null : Number(deal.exit_amount)
                        const profitLoss =
                          !isOpen && exitAmount != null ? exitAmount - entryAmount : null
                        const isProfit = profitLoss != null && profitLoss >= 0
                        const displayName = locale === 'ar' ? deal.name_ar : deal.name_en

                        const openDateStr = deal.entry_date
                          ? format(parseLocalISODate(deal.entry_date.slice(0, 10)), 'yyyy-MM-dd')
                          : '—'
                        const closeDateStr =
                          !isOpen && deal.exit_date
                            ? format(parseLocalISODate(deal.exit_date.slice(0, 10)), 'yyyy-MM-dd')
                            : '—'

                        return (
                          <tr key={deal.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50/50">
                            <td className="whitespace-nowrap px-4 py-4">
                              <span
                                className={cn(
                                  'inline-flex rounded-md border px-2 py-1 text-xs font-bold',
                                  path.badgeClassName
                                )}
                              >
                                {path.label}
                              </span>
                            </td>
                            <td className="max-w-[200px] truncate px-4 py-4 font-bold text-gray-900" title={displayName}>
                              {displayName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-500" dir="ltr">
                              {openDateStr}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-bold text-gray-900" dir="ltr">
                              {formatMoney(entryAmount, locale)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-gray-500" dir="ltr">
                              {closeDateStr}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-bold text-gray-900" dir="ltr">
                              {!isOpen && exitAmount != null ? formatMoney(exitAmount, locale) : '—'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 font-bold" dir="ltr">
                              {profitLoss == null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <span className={isProfit ? 'text-emerald-600' : 'text-red-600'}>
                                  {isProfit ? '+' : ''}
                                  {formatMoney(profitLoss, locale)}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditDeal(deal)}
                                  disabled={!isOpen}
                                  className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-blue-600 hover:bg-blue-50',
                                    !isOpen && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                                  )}
                                  title={t('تعديل', 'Edit')}
                                  aria-label={t('تعديل', 'Edit')}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteOpenDeal(deal)}
                                  disabled={!isOpen || deletingId === deal.id}
                                  className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-red-600 hover:bg-red-50',
                                    !isOpen && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                                  )}
                                  title={t('حذف', 'Delete')}
                                  aria-label={t('حذف', 'Delete')}
                                >
                                  {deletingId === deal.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                  ) : (
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  )}
                                </button>
                                {isOpen ? (
                                  <button
                                    type="button"
                                    onClick={() => openCloseDeal(deal)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-orange-500 hover:bg-orange-50"
                                    title={t('إغلاق الصفقة', 'Close deal')}
                                    aria-label={t('إغلاق الصفقة', 'Close deal')}
                                  >
                                    <Power className="h-4 w-4" aria-hidden />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => cancelCloseDeal(deal)}
                                    disabled={cancellingId === deal.id}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                                    title={t('إعادة فتح الصفقة', 'Reopen deal')}
                                    aria-label={t('إعادة فتح الصفقة', 'Reopen deal')}
                                  >
                                    {cancellingId === deal.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    ) : (
                                      <RotateCcw className="h-4 w-4" aria-hidden />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <InvestmentWalletTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onSaved={reload}
        mode={transferMode}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <InvestmentDealModal
        open={dealModalOpen}
        onClose={() => setDealModalOpen(false)}
        onSaved={reload}
        mode={dealModalMode}
        edit={dealEditing}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <InvestmentCloseModal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onSaved={reload}
        investment={dealClosing}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <InvestmentActivityLogModal
        open={activityLogOpen}
        onClose={() => setActivityLogOpen(false)}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />
    </div>
  )
}