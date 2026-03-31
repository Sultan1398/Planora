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
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { InvestmentWalletTransferModal } from '@/components/investments/InvestmentWalletTransferModal'
import { InvestmentDealModal } from '@/components/investments/InvestmentDealModal'
import { InvestmentCloseModal } from '@/components/investments/InvestmentCloseModal'
import { InvestmentActivityLogModal } from '@/components/investments/InvestmentActivityLogModal'
import { Pencil, ArrowDownLeft, ArrowUpRight, Trash2, Loader2, Power, ScrollText } from 'lucide-react'
import { Wallet, ChartLineUp, CheckCircle, CaretUp, CaretDown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAvailableCash } from '@/hooks/useAvailableCash'

const investmentsNav = getAppNavItem('/investments')

export default function InvestmentsPage() {
  const { t, locale, isRTL } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [investments, setInvestments] = useState<Investment[]>([])

  const [walletNow, setWalletNow] = useState<number | null>(null)
  const [internalNow, setInternalNow] = useState<number | null>(null)
  const [walletDepositsTotal, setWalletDepositsTotal] = useState(0)
  const [walletWithdrawalsTotal, setWalletWithdrawalsTotal] = useState(0)
  const [isOpenDealsOpen, setIsOpenDealsOpen] = useState(true)
  const [isClosedDealsOpen, setIsClosedDealsOpen] = useState(true)
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
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
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
          <div className="mb-10 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            {/* الجزء العلوي: الرصيد والأزرار */}
            <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
              <div className="flex flex-col items-start">
                <div className="mb-2 flex items-center gap-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50">
                    <Wallet weight="duotone" className="h-5 w-5 text-indigo-600" aria-hidden />
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

              <div className="mt-4 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mt-0">
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
                  className="flex items-center justify-center gap-x-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  <ArrowDownLeft className="h-5 w-5" aria-hidden />
                  {t('إيداع', 'Deposit')}
                </button>
              </div>
            </div>

            {/* الجزء السفلي: إجماليات الاستثمارات */}
            <div className="grid grid-cols-1 border-t border-gray-100 bg-white sm:grid-cols-3">
              <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
                <p className="text-sm font-medium text-indigo-600">{t('قيمة المحفظة الاستثمارية', 'Portfolio Value')}</p>
                <p className="mt-2 text-2xl font-bold text-indigo-700" dir="ltr">
                  {formatMoney(portfolioValue, locale)}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0 sm:border-s border-gray-200">
                <p className="text-sm font-medium text-indigo-600">{t('السيولة النقدية', 'Cash Liquidity')}</p>
                <p className="mt-2 text-2xl font-bold text-indigo-700" dir="ltr">
                  {formatMoney(liquidityCash, locale)}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-4 text-center sm:border-s border-gray-200">
                <p className="text-sm font-medium text-indigo-600">{t('الربح/الخسارة', 'Profit/Loss')}</p>
                <p className={cn('mt-2 text-2xl font-bold', totalProfit >= 0 ? 'text-green-600' : 'text-red-600')} dir="ltr">
                  {totalProfit > 0 ? '+' : ''}
                  {formatMoney(totalProfit, locale)}
                </p>
              </div>
            </div>
          </div>

          <div className={cn('flex flex-col gap-8', locale === 'ar' ? 'text-right' : 'text-left')}>
            <section className="rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setIsOpenDealsOpen((v) => !v)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
                  aria-expanded={isOpenDealsOpen}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                    <ChartLineUp weight="duotone" className="h-6 w-6 text-indigo-600" aria-hidden />
                  </div>
                  <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">{t('صفقات مفتوحة', 'Open deals')}</h2>
                  {isOpenDealsOpen ? (
                    <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                  ) : (
                    <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                  )}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openNewDeal}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    {t('+ صفقة جديدة', '+ New deal')}
                  </button>
                </div>
              </div>

              {isOpenDealsOpen && (
                <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
                  {openDeals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center">
                      <ChartLineUp weight="duotone" className="mb-4 h-16 w-16 text-gray-300" aria-hidden />
                      <p className="mb-5 font-medium text-gray-500">
                        {t('لا توجد صفقات مفتوحة حالياً', 'No open deals right now')}
                      </p>
                      <button
                        type="button"
                        onClick={openNewDeal}
                        className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
                      >
                        {t('+ أضف صفقتك الأولى', '+ Add your first deal')}
                      </button>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {openDeals.map((d) => {
                    const path = investmentPathMeta(d.type)
                    const entryTotal = Number(d.entry_amount)
                    return (
                      <li key={d.id} dir={isRTL ? 'rtl' : 'ltr'} className="rounded-2xl border border-border bg-white px-4 pt-3 pb-2 shadow-sm">
                        <div className="flex min-h-10 items-center justify-between gap-2">
                          <div
                            className={`flex flex-none items-center gap-2 rounded-lg bg-white px-1.5 py-1 ${isRTL ? 'order-2' : 'order-1'}`}
                          >
                            <button
                              type="button"
                              onClick={() => openCloseDeal(d)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
                              title={t('إغلاق الصفقة', 'Close deal')}
                              aria-label={t('إغلاق الصفقة', 'Close deal')}
                            >
                              <Power size={16} />
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteOpenDeal(d)}
                              disabled={deletingId === d.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-danger hover:bg-red-50 disabled:opacity-50"
                              aria-label={t('حذف', 'Delete')}
                            >
                              {deletingId === d.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditDeal(d)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-brand hover:bg-blue-50"
                              aria-label={t('تعديل', 'Edit')}
                            >
                              <Pencil size={16} />
                            </button>
                          </div>

                          <div className={`min-w-0 flex-1 ${isRTL ? 'order-1 text-start ps-0' : 'order-2 text-end pe-0'}`}>
                            <div className={`flex w-full items-center gap-3 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                              <p className="min-w-0 text-sm font-bold text-slate-900 leading-relaxed break-words">
                                {locale === 'ar' ? d.name_ar : d.name_en}
                              </p>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-normal ${path.badgeClassName}`}
                              >
                                {path.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="my-2 border-t border-border" />

                        <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50/70 px-3 py-2">
                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('قيمة الفتح', 'Open value')}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 leading-none" dir="ltr">
                              {formatMoney(entryTotal, locale)}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('تاريخ فتح الصفقة', 'Open date')}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 leading-none" dir="ltr">
                              {d.entry_date ?? '—'}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setIsClosedDealsOpen((v) => !v)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
                  aria-expanded={isClosedDealsOpen}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <CheckCircle weight="duotone" className="h-6 w-6 text-emerald-600" aria-hidden />
                  </div>
                  <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">{t('صفقات مغلقة', 'Closed deals')}</h2>
                  {isClosedDealsOpen ? (
                    <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                  ) : (
                    <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActivityLogOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-surface"
                >
                  <ScrollText className="h-4 w-4 text-brand" />
                  {t('سجل الفترة', 'Activity log')}
                </button>
              </div>

              {isClosedDealsOpen && (
                <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
                  {closedDeals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center">
                      <CheckCircle weight="duotone" className="mb-4 h-16 w-16 text-gray-300" aria-hidden />
                      <p className="font-medium text-gray-500">{t('لا توجد صفقات مغلقة بعد', 'No closed deals yet')}</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {closedDeals.map((d) => {
                    const entry = Number(d.entry_amount)
                    const exit = d.exit_amount == null ? 0 : Number(d.exit_amount)
                    const pl = exit - entry
                    const path = investmentPathMeta(d.type)

                    return (
                      <li key={d.id} dir={isRTL ? 'rtl' : 'ltr'} className="rounded-2xl border border-border bg-white px-4 pt-3 pb-2 shadow-sm">
                        <div className="flex min-h-10 items-center justify-between gap-2">
                          <div className={`flex flex-none items-center rounded-lg bg-white px-1.5 py-1 ${isRTL ? 'order-2' : 'order-1'}`}>
                            <button
                              type="button"
                              onClick={() => cancelCloseDeal(d)}
                              disabled={cancellingId === d.id}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              title={t('إعادة فتح الصفقة', 'Reopen deal')}
                              aria-label={t('إعادة فتح الصفقة', 'Reopen deal')}
                            >
                              <Power size={15} />
                              <span>{cancellingId === d.id ? t('جارٍ الإلغاء…', 'Cancelling…') : t('فتح', 'Open')}</span>
                            </button>
                          </div>

                          <div className={`min-w-0 flex-1 ${isRTL ? 'order-1 text-start ps-0' : 'order-2 text-end pe-0'}`}>
                            <div className={`flex w-full items-center gap-3 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                              <p className="min-w-0 text-sm font-bold text-slate-900 leading-relaxed break-words">
                                {locale === 'ar' ? d.name_ar : d.name_en}
                              </p>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-normal ${path.badgeClassName}`}
                              >
                                {path.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="my-2 border-t border-border" />

                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50/70 px-3 py-2 sm:grid-cols-4 sm:gap-4">
                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('قيمة الفتح', 'Open value')}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 leading-none" dir="ltr">
                              {formatMoney(entry, locale)}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('قيمة الإغلاق', 'Close value')}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 leading-none" dir="ltr">
                              {formatMoney(exit, locale)}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('ربح/خسارة', 'P/L')}</p>
                            <p
                              className={`mt-0.5 text-sm font-bold tabular-nums leading-none ${pl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                              dir="ltr"
                            >
                              {formatMoney(pl, locale)}
                            </p>
                          </div>

                          <div className="text-center">
                            <p className="text-xs font-medium text-muted">{t('تاريخ الإغلاق', 'Close date')}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 leading-none" dir="ltr">
                              {d.exit_date ?? '—'}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                    </ul>
                  )}
                </div>
              )}
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