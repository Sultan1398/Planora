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
import { cn } from '@/lib/utils'
import { DashboardTabPanel } from '@/components/hub/DashboardTabPanel'
import { StatisticsTabPanel } from '@/components/hub/StatisticsTabPanel'

const hubNav = getAppNavItem('/hub')

type HubTabId = 'overview' | 'analytics' | 'year'

function parseHubTab(tab: string | null): HubTabId {
  if (tab === 'analytics' || tab === 'year') return tab
  return 'overview'
}

type HubTotals = {
  income: number
  generalExpensesTotal: number
  generalExpensesPaid: number
  obligationPaymentsInPeriod: number
  totalPaidFromWallet: number
  savingsNet: number
  investmentsNet: number
  investedOpen: number
  investmentNetPL: number
  openDeals: number
}

const emptyTotals: HubTotals = {
  income: 0,
  generalExpensesTotal: 0,
  generalExpensesPaid: 0,
  obligationPaymentsInPeriod: 0,
  totalPaidFromWallet: 0,
  savingsNet: 0,
  investmentsNet: 0,
  investedOpen: 0,
  investmentNetPL: 0,
  openDeals: 0,
}

function HubPageInner() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates } = usePeriod()
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

  const loadHub = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setTotals(emptyTotals)
      setLoading(false)
      return
    }

    const start = dateToLocalISODate(periodDates.start)
    const end = dateToLocalISODate(periodDates.end)

    const [inflowsRes, outflowsRes, savingsTxRes, investmentsRes, invWalletTxRes] = await Promise.all([
      supabase.from('inflows').select('amount').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase
        .from('outflows')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end),
      supabase.from('savings_transactions').select('amount, type').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('investments').select('entry_amount, status, exit_amount').eq('user_id', user.id),
      supabase
        .from('investment_wallet_transactions')
        .select('amount, type')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .in('type', ['deposit', 'withdrawal'] as const),
    ])

    const firstErr =
      inflowsRes.error ||
      outflowsRes.error ||
      savingsTxRes.error ||
      investmentsRes.error ||
      invWalletTxRes.error
    if (firstErr) {
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

    let income = 0
    for (const r of inflowRows) income += Number(r.amount)

    let generalExpensesTotal = 0
    let generalExpensesPaid = 0
    let obligationPaymentsInPeriod = 0
    let totalPaidFromWallet = 0
    for (const r of outflowRows) {
      const a = Number(r.amount)
      const isObligation = outflowIsObligationLinkedExpense(r)
      if (!isObligation) generalExpensesTotal += a
      if (r.status === 'paid') {
        totalPaidFromWallet += a
        if (isObligation) obligationPaymentsInPeriod += a
        else generalExpensesPaid += a
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

    setTotals({
      income,
      generalExpensesTotal,
      generalExpensesPaid,
      obligationPaymentsInPeriod,
      totalPaidFromWallet: totalPaidFromWallet,
      savingsNet,
      investmentsNet,
      investedOpen,
      investmentNetPL,
      openDeals,
    })
    setLoading(false)
  }, [periodDates.start, periodDates.end])

  useEffect(() => {
    // Defer fetch so the effect body does not synchronously invoke setState (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void loadHub()
    })
  }, [loadHub, periodKey])

  const cashOnHand = useMemo(
    () => totals.income - totals.totalPaidFromWallet - totals.savingsNet - totals.investmentsNet,
    [totals.income, totals.totalPaidFromWallet, totals.savingsNet, totals.investmentsNet]
  )

  const fmt = (n: number) => (loading ? '—' : formatMoney(n, locale))

  const summaryCards = [
    { labelAr: 'إجمالي الدخل', labelEn: 'Total Income', value: totals.income, color: 'text-success' },
    {
      labelAr: 'المصروفات العامة',
      labelEn: 'General expenses',
      value: totals.generalExpensesTotal,
      color: 'text-danger',
    },
    {
      labelAr: 'سداد التزامات',
      labelEn: 'Obligation payments',
      value: totals.obligationPaymentsInPeriod,
      color: 'text-warning',
    },
    { labelAr: 'المدخرات', labelEn: 'Savings', value: totals.savingsNet, color: 'text-brand' },
  ] as const

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
    <div className={cn('mx-auto p-6', shellMax)}>
      <PageHeader nav={hubNav} subtitle={pageSubtitle} actions={<PeriodNavigator />} />

      <div
        className="mb-8 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-100 bg-white p-1.5 shadow-inner md:w-auto"
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
              ? 'bg-blue-600 font-bold text-white shadow-md'
              : 'font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
              ? 'bg-blue-600 font-bold text-white shadow-md'
              : 'font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
              ? 'bg-blue-600 font-bold text-white shadow-md'
              : 'font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="relative mb-6 overflow-hidden rounded-2xl bg-brand p-6 text-white shadow-sm">
            <p className="mb-2 text-sm font-medium text-white/80">{t('النقد المتاح', 'Cash on Hand')}</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{fmt(cashOnHand)}</p>
            <p className="mt-3 text-xs font-normal leading-relaxed text-white/70">
              {t('الدخل − إجمالي المدفوع من المحفظة في الفترة', 'Income − total paid from wallet this period')}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.labelEn}
                className="rounded-xl border border-border bg-white p-5 text-center shadow-sm"
              >
                <p className="mb-2 text-sm font-medium text-muted">{t(card.labelAr, card.labelEn)}</p>
                <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{fmt(card.value)}</p>
              </div>
            ))}
          </div>

          <div className="mb-6 rounded-xl border border-border bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-center text-base font-semibold text-gray-500">
              {t('ملخص الاستثمارات', 'Investments Summary')}
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="mb-2 text-sm font-medium text-gray-500">{t('إجمالي المستثمر', 'Total Invested')}</p>
                <p className="text-xl font-bold tabular-nums text-slate-900">{fmt(totals.investedOpen)}</p>
              </div>
              <div className="text-center">
                <p className="mb-2 text-sm font-medium text-gray-500">{t('صافي الربح/الخسارة', 'Net P&L')}</p>
                <p
                  className={`text-xl font-bold tabular-nums ${
                    totals.investmentNetPL >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {fmt(totals.investmentNetPL)}
                </p>
              </div>
              <div className="text-center">
                <p className="mb-2 text-sm font-medium text-gray-500">{t('صفقات مفتوحة', 'Open Deals')}</p>
                <p className="text-xl font-bold tabular-nums text-slate-900">
                  {loading ? '—' : String(totals.openDeals)}
                </p>
              </div>
            </div>
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
        <div className="mx-auto max-w-5xl p-6">
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
