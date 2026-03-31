'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { outflowIsObligationLinkedExpense } from '@/lib/obligation-helpers'
import { getPeriodDates, getPrevPeriodKey } from '@/lib/period'
import { cn } from '@/lib/utils'
import { DashboardTabPanel } from '@/components/hub/DashboardTabPanel'
import { StatisticsTabPanel } from '@/components/hub/StatisticsTabPanel'
import { usePeriodObligations } from '@/hooks/usePeriodObligations'
import { useRolloverBalance } from '@/hooks/useRolloverBalance'
import {
  TrendingUp,
  ShoppingCart,
  Landmark,
  FileText,
  CheckCircle,
  AlertCircle,
  Briefcase,
  Activity,
  Layers,
  List,
} from 'lucide-react'

const hubNav = getAppNavItem('/hub')

type HubTabId = 'overview' | 'analytics' | 'year'

function parseHubTab(tab: string | null): HubTabId {
  if (tab === 'analytics' || tab === 'year') return tab
  return 'overview'
}

type HubTotals = {
  income: number
  incomeRolledOver: number
  incomeWithRollover: number
  generalExpensesTotal: number
  generalExpensesPaid: number
  totalPaidFromWallet: number
  savingsNet: number
  savingsCumulativeDeposits: number
  investmentsNet: number
  investedOpen: number
  investmentNetPL: number
  openDeals: number
  cashOnHand: number
}

const emptyTotals: HubTotals = {
  income: 0,
  incomeRolledOver: 0,
  incomeWithRollover: 0,
  generalExpensesTotal: 0,
  generalExpensesPaid: 0,
  totalPaidFromWallet: 0,
  savingsNet: 0,
  savingsCumulativeDeposits: 0,
  investmentsNet: 0,
  investedOpen: 0,
  investmentNetPL: 0,
  openDeals: 0,
  cashOnHand: 0,
}

function HubPageInner() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = parseHubTab(searchParams.get('tab'))

  const setHubTab = useCallback(
    (id: HubTabId) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === 'overview') {
        params.delete('tab')
      } else {
        params.set('tab', id)
      }
      const q = params.toString()
      router.replace(q ? `/hub?${q}` : '/hub', { scroll: false })
    },
    [router, searchParams]
  )

  const [totals, setTotals] = useState<HubTotals>(emptyTotals)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const start = dateToLocalISODate(periodDates.start)
  const end = dateToLocalISODate(periodDates.end)

  // نُمرِّر مكونات الفترة السابقة المحسوبة في loadHub للـ hook ليتولى فقط حساب قيمة "الدخل المرحّل" بشكل موحد.
  const [previousComponentsForRollover, setPreviousComponentsForRollover] = useState<{
    incomePrev: number
    totalPaidFromWalletPrev: number
    savingsNetPrev: number
    investmentsNetPrev: number
  } | null>(null)

  const prevPeriodKey = getPrevPeriodKey(periodKey)
  const prevPeriodDates = getPeriodDates(prevPeriodKey, startDay)
  const prevStart = dateToLocalISODate(prevPeriodDates.start)
  const prevEnd = dateToLocalISODate(prevPeriodDates.end)
  const {
    summary: obligationsSummary,
    loading: obligationsLoading,
    error: obligationsError,
  } = usePeriodObligations({
    periodStart: start,
    periodEnd: end,
  })

  const {
    rolledOverBalance,
    loading: rolloverLoading,
    error: rolloverError,
  } = useRolloverBalance({
    periodKey,
    periodDates,
    startDay,
    previousComponents: previousComponentsForRollover ?? undefined,
  })

  const loadHub = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isStillMounted()) return
    if (!user) {
      setTotals(emptyTotals)
      setLoading(false)
      return
    }

    const [
      inflowsRes,
      outflowsRes,
      savingsTxRes,
      investmentsRes,
      invWalletTxRes,
      inflowsPrevRes,
      outflowsPrevRes,
      savingsTxPrevRes,
      invWalletTxPrevRes,
      savingsDepositsCumRes,
    ] = await Promise.all([
      supabase.from('inflows').select('amount').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase
        .from('outflows')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('savings_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end),
      supabase.from('investments').select('entry_amount, status, exit_amount').eq('user_id', user.id),
      supabase
        .from('investment_wallet_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .in('type', ['deposit', 'withdrawal'] as const),
      supabase.from('inflows').select('amount').eq('user_id', user.id).gte('date', prevStart).lte('date', prevEnd),
      supabase
        .from('outflows')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', prevStart)
        .lte('date', prevEnd),
      supabase
        .from('savings_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', prevStart)
        .lte('date', prevEnd),
      supabase
        .from('investment_wallet_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', prevStart)
        .lte('date', prevEnd)
        .in('type', ['deposit', 'withdrawal'] as const),
      supabase
        .from('savings_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'deposit')
        .lte('date', end),
    ])

    if (!isStillMounted()) return

    const firstErr =
      inflowsRes.error ||
      outflowsRes.error ||
      savingsTxRes.error ||
      investmentsRes.error ||
      invWalletTxRes.error ||
      inflowsPrevRes.error ||
      outflowsPrevRes.error ||
      savingsTxPrevRes.error ||
      invWalletTxPrevRes.error ||
      savingsDepositsCumRes.error
    if (firstErr) {
      if (!isStillMounted()) return
      setError(firstErr.message)
      setTotals(emptyTotals)
      setLoading(false)
      return
    }

    const inflowRows = (inflowsRes.data ?? []) as { amount: number }[]
    const outflowRows = (outflowsRes.data ?? []) as {
      amount: number
      status: string
      obligation_id?: string | null
      name_ar?: string | null
      name_en?: string | null
    }[]
    const savingsRows = (savingsTxRes.data ?? []) as { amount: number; type: string }[]
    const invRows = (investmentsRes.data ?? []) as {
      entry_amount: number
      status: string
      exit_amount: number | null
    }[]

    const inflowPrevRows = (inflowsPrevRes.data ?? []) as { amount: number }[]
    const outflowPrevRows = (outflowsPrevRes.data ?? []) as {
      amount: number
      status: string
    }[]
    const savingsPrevRows = (savingsTxPrevRes.data ?? []) as { amount: number; type: string }[]
    const invWalletPrevRows = (invWalletTxPrevRes.data ?? []) as Array<{ amount: number; type: string }>
    const savingsDepositsCumRows = (savingsDepositsCumRes.data ?? []) as Array<{ amount: number }>
    let income = 0
    for (const r of inflowRows) income += Number(r.amount)

    let generalExpensesTotal = 0
    let generalExpensesPaid = 0
    let totalPaidFromWallet = 0
    for (const r of outflowRows) {
      const a = Number(r.amount)
      const isObligation = outflowIsObligationLinkedExpense(r)
      if (!isObligation) generalExpensesTotal += a
      if (r.status === 'paid') {
        totalPaidFromWallet += a
        if (!isObligation) generalExpensesPaid += a
      }
    }

    let savingsNet = 0
    for (const r of savingsRows) {
      const a = Number(r.amount)
      if (r.type === 'deposit') savingsNet += a
      else savingsNet -= a
    }

    let investmentsNet = 0
    for (const r of (invWalletTxRes.data ?? []) as Array<{ amount: number; type: string }>) {
      const a = Number(r.amount)
      if (r.type === 'deposit') investmentsNet += a
      else investmentsNet -= a
    }

    // ===== Rollover / cumulative: previous period + savings deposits up to end =====
    let incomePrev = 0
    for (const r of inflowPrevRows) incomePrev += Number(r.amount)

    // إجمالي ما تم صرفه في الفترة السابقة = المدفوعات من المحفظة (مصروفات + سداد التزامات) + صافي المدخرات في تلك الفترة
    let totalPaidFromWalletPrev = 0
    for (const r of outflowPrevRows) {
      if (r.status === 'paid') totalPaidFromWalletPrev += Number(r.amount)
    }

    let savingsNetPrev = 0
    for (const r of savingsPrevRows) {
      const a = Number(r.amount)
      if (r.type === 'deposit') savingsNetPrev += a
      else savingsNetPrev -= a
    }

    let investmentsNetPrev = 0
    for (const r of invWalletPrevRows) {
      const a = Number(r.amount)
      if (r.type === 'deposit') investmentsNetPrev += a
      else investmentsNetPrev -= a
    }

    // نوفّر مكونات الفترة السابقة للـ hook ليتولى حساب "الدخل المرحّل" بشكل موحّد.
    setPreviousComponentsForRollover({
      incomePrev,
      totalPaidFromWalletPrev,
      savingsNetPrev,
      investmentsNetPrev,
    })

    // مبدئياً؛ سيتم تحديث القيم بدقة عندما ينتهي hook من حسابها.
    const incomeRolledOver = 0
    const incomeWithRollover = income

    // بطاقة "المدخرات": تراكمية (ودائع فقط) حتى نهاية الفترة المحددة
    let savingsCumulativeDeposits = 0
    for (const r of savingsDepositsCumRows) savingsCumulativeDeposits += Number(r.amount)

    let investedOpen = 0
    let investmentNetPL = 0
    let openDeals = 0
    for (const r of invRows) {
      if (r.status === 'open') {
        investedOpen += Number(r.entry_amount)
        openDeals += 1
      } else if (r.status === 'closed' && r.exit_amount != null) {
        investmentNetPL += Number(r.exit_amount) - Number(r.entry_amount)
      }
    }

    if (!isStillMounted()) return
    // نقد متاح مع دورة محاسبية كاملة (يتضمن ترحيل كامل بما فيه استثمارات النظام كما في معادلة الـ cashOnHand الحالية)
    const cashOnHandPrev = incomePrev - totalPaidFromWalletPrev - savingsNetPrev - investmentsNetPrev
    const cashOnHandCurrent = income - totalPaidFromWallet - savingsNet - investmentsNet
    const cashOnHand = cashOnHandPrev + cashOnHandCurrent

    setTotals({
      income,
      incomeRolledOver,
      incomeWithRollover,
      generalExpensesTotal,
      generalExpensesPaid,
      totalPaidFromWallet: totalPaidFromWallet,
      savingsNet,
      savingsCumulativeDeposits,
      investmentsNet,
      investedOpen,
      investmentNetPL,
      openDeals,
      cashOnHand,
    })
    setLoading(false)
  }, [start, end, prevStart, prevEnd, periodKey])

  // بعد حساب قيمة "الدخل المرحّل" عبر الـ hook، حدّث قيم بطاقات نظرة عامة.
  useEffect(() => {
    if (!previousComponentsForRollover) return
    setTotals((prev) => ({
      ...prev,
      incomeRolledOver: rolledOverBalance,
      incomeWithRollover: prev.income + rolledOverBalance,
    }))
  }, [rolledOverBalance, previousComponentsForRollover])

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    // Defer fetch so the effect body does not synchronously invoke setState (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void loadHub(isStillMounted)
    })
    return () => {
      isMounted = false
    }
  }, [loadHub, periodKey])

  const pageLoading = loading || obligationsLoading || rolloverLoading
  const mergedError = [error, obligationsError, rolloverError].filter(Boolean).join(' · ')
  const fmt = (n: number) => (pageLoading ? '—' : formatMoney(n, locale))

  const pageSubtitle = useMemo(() => {
    if (activeTab === 'analytics') {
      return t(
        'تحليل سنة مالية واحدة (١٢ فترة مرقمة) — حركة السيولة، الإيرادات، المصروفات، والاستثمار',
        'One financial year (12 numbered periods): liquidity, income, expenses, and investments'
      )
    }
    if (activeTab === 'year') {
      return t(
        'جدول ملخص لسنة مالية واحدة (١٢ فترة) — الفترة المختارة تحدد أي سنة مالية تُعرض',
        'Summary for one financial year (12 periods). The selected period chooses which FY is shown.'
      )
    }
    return t('نظرة عامة على الفترة المالية', 'Financial period overview')
  }, [activeTab, t])

  const shellMax =
    activeTab === 'year' ? 'max-w-[90rem]' : activeTab === 'analytics' ? 'max-w-6xl' : 'max-w-5xl'

  return (
    <div className={cn('mx-auto p-4 lg:p-6', shellMax)}>
      <PageHeader nav={hubNav} subtitle={pageSubtitle} actions={<PeriodNavigator />} />

      <div
        className="mb-8 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-100 bg-white p-1.5 shadow-inner md:w-auto"
        role="tablist"
        id="hub-tablist"
        aria-label={t('أقسام المحفظة', 'Hub sections')}
      >
        <button
          type="button"
          id="hub-tab-overview"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setHubTab('overview')}
          className={cn(
            'min-w-0 flex-1 cursor-pointer rounded-full px-7 py-3 text-sm transition-all duration-200 md:flex-initial',
            activeTab === 'overview'
              ? 'bg-brand font-bold text-white shadow-md'
              : 'font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          )}
        >
          {t('نظرة عامة', 'Overview')}
        </button>
        <button
          type="button"
          id="hub-tab-analytics"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          onClick={() => setHubTab('analytics')}
          className={cn(
            'min-w-0 flex-1 cursor-pointer rounded-full px-7 py-3 text-sm transition-all duration-200 md:flex-initial',
            activeTab === 'analytics'
              ? 'bg-brand font-bold text-white shadow-md'
              : 'font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          )}
        >
          {t('التحليل', 'Analytics')}
        </button>
        <button
          type="button"
          id="hub-tab-year"
          role="tab"
          aria-selected={activeTab === 'year'}
          onClick={() => setHubTab('year')}
          className={cn(
            'min-w-0 flex-1 cursor-pointer rounded-full px-7 py-3 text-sm transition-all duration-200 md:flex-initial',
            activeTab === 'year'
              ? 'bg-brand font-bold text-white shadow-md'
              : 'font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          )}
        >
          {t('إحصاءات العام', 'Year statistics')}
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div
          role="tabpanel"
          id="hub-panel-overview"
          aria-labelledby="hub-tab-overview"
          tabIndex={0}
        >
          {mergedError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
              {mergedError}
            </div>
          ) : null}

          <div className="relative mb-6 overflow-hidden rounded-2xl bg-brand p-4 text-white shadow-sm lg:p-6">
            <p className="mb-2 text-sm font-medium text-white/80">{t('النقد المتاح', 'Cash on Hand')}</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{fmt(totals.cashOnHand)}</p>
            <p className="mt-3 text-xs font-normal leading-relaxed text-white/70">
              {t('الدخل − إجمالي المدفوع من المحفظة في الفترة', 'Income − total paid from wallet this period')}
            </p>
          </div>

          <div className="mb-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted">{t('إجمالي الدخل', 'Total income')}</p>
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-2xl font-bold tabular-nums text-emerald-500" dir="ltr">
                  {fmt(totals.incomeWithRollover)}
                </p>
                {totals.incomeRolledOver > 0 ? (
                  <p className="mt-2 text-xs text-emerald-500/80">
                    {t('يتضمن {amount} ريال مرحّلة من الفترة السابقة', 'Includes {amount} carried over from the previous period').replace(
                      '{amount}',
                      formatMoney(totals.incomeRolledOver, locale)
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-emerald-500/60">{t('لا توجد قيمة مرحّلة', 'No carried value')}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted">{t('المصروفات العامة', 'General expenses')}</p>
                  <ShoppingCart className="h-5 w-5 text-rose-500" />
                </div>
                <p className="text-2xl font-bold tabular-nums text-rose-500" dir="ltr">
                  {fmt(totals.generalExpensesTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-muted">{t('المدخرات', 'Savings')}</p>
                  <Landmark className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold tabular-nums text-blue-500" dir="ltr">
                  {fmt(totals.savingsCumulativeDeposits)}
                </p>
              </div>
            </div>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <List className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-slate-800">
                    {t('ملخص الالتزامات', 'Obligations summary')}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t('تابع تفاصيل ديونك وحالة السداد', 'Track your debt details and payment status')}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('إجمالي الالتزامات', 'Total obligations')}</p>
                    <FileText className="h-5 w-5 text-slate-700" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-slate-800" dir="ltr">
                    {fmt(obligationsSummary.totalObligations)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('إجمالي المسدد', 'Total paid')}</p>
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-emerald-500" dir="ltr">
                    {fmt(obligationsSummary.totalPaid)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('إجمالي المتبقي', 'Total remaining')}</p>
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-orange-500" dir="ltr">
                    {fmt(obligationsSummary.totalRemaining)}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Briefcase className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-slate-800">
                    {t('ملخص الاستثمارات', 'Investments summary')}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t(
                      'أداء محفظتك الاستثمارية وصفقاتك النشطة',
                      'Portfolio performance and your active deals'
                    )}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('إجمالي المستثمر', 'Total invested')}</p>
                    <Briefcase className="h-5 w-5 text-indigo-500" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-indigo-500" dir="ltr">
                    {fmt(totals.investedOpen)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('صافي الربح/الخسارة', 'Net P/L')}</p>
                    <Activity
                      className={cn(
                        'h-5 w-5',
                        totals.investmentNetPL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      )}
                    />
                  </div>
                  <p
                    className={cn(
                      'text-2xl font-bold tabular-nums',
                      totals.investmentNetPL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    )}
                    dir="ltr"
                  >
                    {fmt(totals.investmentNetPL)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-muted">{t('الصفقات المفتوحة', 'Open deals')}</p>
                    <Layers className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-slate-700" dir="ltr">
                    {loading ? '—' : String(totals.openDeals)}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="hidden rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-danger">
            {t('لديك مدفوعات معلقة', 'You have pending payments')}
          </div>
        </div>
      ) : null}

      {activeTab === 'analytics' ? (
        <div
          role="tabpanel"
          id="hub-panel-analytics"
          aria-labelledby="hub-tab-analytics"
          tabIndex={0}
        >
          <DashboardTabPanel />
        </div>
      ) : null}
      {activeTab === 'year' ? (
        <div
          role="tabpanel"
          id="hub-panel-year"
          aria-labelledby="hub-tab-year"
          tabIndex={0}
        >
          <StatisticsTabPanel />
        </div>
      ) : null}
    </div>
  )
}

export default function HubPage() {
  const { t } = useLanguage()

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl p-4 lg:p-6">
          <div className="rounded-xl border border-border bg-white p-12 text-center text-muted">
            {t('جارٍ التحميل…', 'Loading…')}
          </div>
        </div>
      }
    >
      <HubPageInner />
    </Suspense>
  )
}
