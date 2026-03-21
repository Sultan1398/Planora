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

const investmentsNav = getAppNavItem('/investments')

export default function InvestmentsPage() {
  const { t, locale, isRTL } = useLanguage()
  const { periodDates } = usePeriod()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [investments, setInvestments] = useState<Investment[]>([])

  const [walletNow, setWalletNow] = useState<number | null>(null)
  const [internalNow, setInternalNow] = useState<number | null>(null)

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
      setLoading(false)
      return
    }

    const [invRes, w, i] = await Promise.all([
      supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      computeWalletCashNow(supabase, user.id),
      computeInvestmentInternalBalance(supabase, user.id),
    ])

    if (invRes.error) {
      setError(invRes.error.message)
      setInvestments([])
      setWalletNow(null)
      setInternalNow(null)
      setLoading(false)
      return
    }

    setInvestments((invRes.data as Investment[] | null) ?? [])
    setWalletNow(w)
    setInternalNow(i)
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

  function investmentPathMeta(type: Investment['type']) {
    // Map DB type -> user-facing Arabic label + professional color
    switch (type) {
      case 'stocks':
        return { label: t('أسهم', 'Stocks'), badgeClassName: 'bg-blue-50 text-blue-600 border-blue-100' }
      case 'partnership':
        return { label: t('فوركس', 'Forex'), badgeClassName: 'bg-emerald-50 text-emerald-600 border-emerald-100' }
      case 'freelance':
        return { label: t('عقار', 'Real estate'), badgeClassName: 'bg-orange-50 text-orange-600 border-orange-100' }
      case 'other':
      default:
        return { label: t('مشاريع', 'Projects'), badgeClassName: 'bg-red-50 text-red-600 border-red-100' }
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
          <div className="mb-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 lg:items-center lg:divide-x lg:divide-border lg:rtl:divide-x-reverse">
              <div className="py-1 lg:px-4">
                <div className="flex flex-col items-center text-center">
                  <p className="text-sm text-muted font-medium">{t('النقد المتاح (الحالي)', 'Available wallet cash (now)')}</p>
                  <p className="text-2xl font-bold text-brand tabular-nums" dir="ltr">
                    {walletNow == null ? '—' : formatMoney(walletNow, locale)}
                  </p>
                </div>
              </div>

              <div className="py-1 lg:px-4">
                <div className="flex flex-col items-center text-center">
                  <p className="text-sm text-muted font-medium">{t('محفظة الاستثمارات', 'Investments wallet')}</p>
                  <p className="text-2xl font-bold text-violet-600 tabular-nums" dir="ltr">
                    {internalNow == null ? '—' : formatMoney(internalNow, locale)}
                  </p>
                </div>
              </div>

              <div className="py-1 lg:px-4">
                <div className="flex flex-col items-center text-center">
                  <p className="text-sm text-muted font-medium">{t('الربح/الخسارة', 'Profit/Loss')}</p>
                  <p className="text-2xl font-bold tabular-nums" dir="ltr">
                    <span className={profitLossInPeriod >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {formatMoney(profitLossInPeriod, locale)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="grid w-full grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  setTransferMode('deposit')
                  setTransferOpen(true)
                }}
                className="inline-flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-2 text-xs font-medium leading-tight text-white shadow-sm hover:bg-brand-dark transition-colors sm:gap-2 sm:px-2.5 sm:text-sm"
              >
                <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="min-w-0 text-center">{t('إيداع للاستثمارات', 'Deposit')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTransferMode('withdrawal')
                  setTransferOpen(true)
                }}
                className="inline-flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-rose-700/25 bg-rose-600 px-2 text-xs font-medium leading-tight text-white shadow-sm hover:bg-rose-700 transition-colors sm:gap-2 sm:px-2.5 sm:text-sm"
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="min-w-0 text-center">{t('سحب للمحفظة', 'Withdraw')}</span>
              </button>

              <button
                type="button"
                onClick={openNewDeal}
                className="inline-flex h-10 w-full min-w-0 items-center justify-center rounded-xl bg-emerald-600 px-2 text-xs font-medium leading-tight text-white shadow-sm hover:bg-emerald-700 transition-colors sm:px-2.5 sm:text-sm"
              >
                <span className="min-w-0 text-center">{t('+ صفقة جديدة', '+ New deal')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActivityLogOpen(true)}
                className="inline-flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-2 text-xs font-medium leading-tight text-slate-700 shadow-sm hover:bg-surface transition-colors sm:gap-2 sm:px-2.5 sm:text-sm"
              >
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-brand sm:h-4 sm:w-4" />
                <span className="min-w-0 text-center">{t('سجل عمليات الفترة', 'Period activity log')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="h-full rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="font-bold text-slate-900">{t('صفقات مفتوحة', 'Open deals')}</h2>
              </div>

              {openDeals.length === 0 ? (
                <div className="px-2 py-10 text-center text-muted">{t('لا توجد صفقات مفتوحة حالياً', 'No open deals right now')}</div>
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

            <div className="h-full rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h2 className="font-bold text-slate-900">{t('صفقات مغلقة', 'Closed deals')}</h2>
              </div>

              {closedDeals.length === 0 ? (
                <div className="px-2 py-10 text-center text-muted">{t('لا توجد صفقات مغلقة بعد', 'No closed deals yet')}</div>
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