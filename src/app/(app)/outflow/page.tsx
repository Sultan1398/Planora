'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { formatGregorianDate } from '@/lib/period'
import { parseLocalISODate } from '@/lib/date-local'
import { computeAvailableCash } from '@/lib/cash-liquidity'
import {
  obligationPaidAmount,
  obligationRemaining,
  outflowIsObligationLinkedExpense,
  sumLegacyMarkerPayments,
} from '@/lib/obligation-helpers'
import type { Outflow, Obligation } from '@/types/database'
import { GeneralOutflowModal } from '@/components/outflow/GeneralOutflowModal'
import { ObligationFormModal } from '@/components/outflow/ObligationFormModal'
import { ObligationPayModal } from '@/components/outflow/ObligationPayModal'
import { Pencil, Trash2, Loader2, Wallet, CreditCard, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const outflowNav = getAppNavItem('/outflow')

type Tab = 'general' | 'obligations'

export default function OutflowPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates } = usePeriod()
  const [tab, setTab] = useState<Tab>('general')
  const [outflows, setOutflows] = useState<Outflow[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [availableCash, setAvailableCash] = useState<number | null>(null)

  const [generalModal, setGeneralModal] = useState(false)
  const [editingOutflow, setEditingOutflow] = useState<Outflow | null>(null)
  const [obligationFormOpen, setObligationFormOpen] = useState(false)
  const [editingObligation, setEditingObligation] = useState<Obligation | null>(null)
  const [payObligation, setPayObligation] = useState<Obligation | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** لحساب السداد عبر علامة الاسم (بدون عمود paid_amount) */
  const [outflowsForObligationMarkers, setOutflowsForObligationMarkers] = useState<
    Array<{ amount: number; name_ar?: string | null; name_en?: string | null }>
  >([])

  const start = dateToLocalISODate(periodDates.start)
  const end = dateToLocalISODate(periodDates.end)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setOutflows([])
      setObligations([])
      setOutflowsForObligationMarkers([])
      setAvailableCash(null)
      setLoading(false)
      return
    }

    const [outRes, oblRes, markerRes] = await Promise.all([
      supabase
        .from('outflows')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('obligations')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: true }),
      supabase
        .from('outflows')
        .select('amount, name_ar, name_en')
        .eq('user_id', user.id),
    ])

    if (markerRes.error) {
      setError((prev) => (prev ? `${prev} · ${markerRes.error!.message}` : markerRes.error!.message))
      setOutflowsForObligationMarkers([])
    } else {
      setOutflowsForObligationMarkers(
        (markerRes.data as Array<{ amount: number; name_ar?: string | null; name_en?: string | null }> | null) ??
          []
      )
    }

    if (outRes.error) {
      setError(outRes.error.message)
      setOutflows([])
    } else {
      const raw = (outRes.data as Outflow[] | null) ?? []
      setOutflows(raw.filter((r) => !outflowIsObligationLinkedExpense(r as Outflow)))
    }

    if (oblRes.error) {
      setError((prev) => (prev ? `${prev} · ${oblRes.error!.message}` : oblRes.error!.message))
      setObligations([])
    } else {
      setObligations((oblRes.data as Obligation[] | null) ?? [])
    }

    try {
      const cash = await computeAvailableCash(supabase, user.id, start, end)
      setAvailableCash(cash)
    } catch {
      setAvailableCash(null)
    }

    setLoading(false)
  }, [start, end])

  useEffect(() => {
    reload()
  }, [reload, periodKey])

  function openAddGeneral() {
    setEditingOutflow(null)
    setGeneralModal(true)
  }

  function openEditGeneral(row: Outflow) {
    setEditingOutflow(row)
    setGeneralModal(true)
  }

  async function deleteGeneral(id: string) {
    if (!confirm(t('حذف هذا المصروف؟', 'Delete this expense?'))) return
    setDeletingId(id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('outflows').delete().eq('id', id)
    setDeletingId(null)
    if (delErr) {
      alert(delErr.message)
      return
    }
    reload()
  }

  function openAddObligation() {
    setEditingObligation(null)
    setObligationFormOpen(true)
  }

  function openEditObligation(row: Obligation) {
    setEditingObligation(row)
    setObligationFormOpen(true)
  }

  async function deleteObligation(row: Obligation) {
    const markerPaid = sumLegacyMarkerPayments(outflowsForObligationMarkers, row.id)
    if (obligationPaidAmount(row, markerPaid) > 0.0001) {
      alert(
        t('لا يمكن حذف التزام تم سداد جزء منه', 'Cannot delete an obligation that has payments recorded')
      )
      return
    }
    if (!confirm(t('حذف هذا الالتزام؟', 'Delete this obligation?'))) return
    setDeletingId(row.id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('obligations').delete().eq('id', row.id)
    setDeletingId(null)
    if (delErr) {
      alert(delErr.message)
      return
    }
    reload()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        nav={outflowNav}
        subtitle={t('المصروفات العامة والتزامات مالية', 'General expenses and financial obligations')}
        actions={<PeriodNavigator />}
      />

      {!loading && availableCash != null ? (
        <div className="mb-4 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">{t('السيولة المتاحة في الفترة', 'Available liquidity this period')}</span>
          <span className="text-lg font-bold text-brand tabular-nums" dir="ltr">
            {formatMoney(availableCash, locale)}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
            tab === 'general' ? 'bg-brand text-white' : 'text-muted hover:bg-surface border border-border'
          )}
        >
          <Wallet size={18} />
          {t('المصروفات العامة', 'General expenses')}
        </button>
        <button
          type="button"
          onClick={() => setTab('obligations')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
            tab === 'obligations' ? 'bg-brand text-white' : 'text-muted hover:bg-surface border border-border'
          )}
        >
          <CreditCard size={18} />
          {t('التزامات مالية', 'Financial obligations')}
        </button>
      </div>

      {tab === 'general' ? (
        <>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={openAddGeneral}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              {t('+ مصروف عام', '+ General expense')}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            ) : outflows.length === 0 ? (
              <div className="px-6 py-14 text-center text-muted">
                <p className="mb-4">{t('لا توجد مصروفات عامة لهذه الفترة', 'No general expenses this period')}</p>
                <button
                  type="button"
                  onClick={openAddGeneral}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  {t('إضافة مصروف', 'Add expense')}
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {outflows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-surface/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {locale === 'ar' ? row.name_ar : row.name_en}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 font-medium',
                            row.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
                          )}
                        >
                          {row.status === 'paid' ? t('مدفوع', 'Paid') : t('معلق', 'Pending')}
                        </span>
                        <span dir="ltr" className="tabular-nums">
                          {formatGregorianDate(parseLocalISODate(row.date), locale)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold text-danger tabular-nums" dir="ltr">
                        {formatMoney(Number(row.amount), locale)}
                      </p>
                      <button
                        type="button"
                        onClick={() => openEditGeneral(row)}
                        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-brand"
                        aria-label={t('تعديل', 'Edit')}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGeneral(row.id)}
                        disabled={deletingId === row.id}
                        className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-50"
                        aria-label={t('حذف', 'Delete')}
                      >
                        {deletingId === row.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={openAddObligation}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              {t('+ التزام مالي', '+ Financial obligation')}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 via-slate-50/50 to-slate-100/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-6">
            {loading ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            ) : obligations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-white/80 px-6 py-14 text-center text-muted">
                <p className="mb-4">{t('لا توجد التزامات مسجّلة', 'No obligations recorded')}</p>
                <button
                  type="button"
                  onClick={openAddObligation}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  {t('إضافة التزام', 'Add obligation')}
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-5 sm:gap-6" role="list">
                {obligations.map((row) => {
                  const total = Number(row.amount)
                  const markerPaid = sumLegacyMarkerPayments(outflowsForObligationMarkers, row.id)
                  const paid = obligationPaidAmount(row, markerPaid)
                  const rem = obligationRemaining(row, markerPaid)
                  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0
                  const isPaid = rem <= 0.0001
                  return (
                    <li
                      key={row.id}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03] transition-all duration-200 hover:border-slate-300/90 hover:shadow-md hover:ring-slate-900/[0.06]"
                    >
                      {/* شريط علوي واحد: العنوان | إجراءات بنفس الارتفاع */}
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-bold text-slate-900">
                            {locale === 'ar' ? row.name_ar : row.name_en}
                          </h3>
                          <p className="mt-0.5 text-xs text-muted">
                            {t('الاستحقاق:', 'Due:')}{' '}
                            <span dir="ltr" className="tabular-nums">
                              {formatGregorianDate(parseLocalISODate(row.due_date), locale)}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-1 sm:gap-1.5">
                          {rem > 0.0001 ? (
                            <button
                              type="button"
                              onClick={() => setPayObligation(row)}
                              className="h-9 shrink-0 rounded-lg bg-brand px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
                            >
                              {t('سداد', 'Pay')}
                            </button>
                          ) : (
                            <span className="inline-flex h-9 max-w-[9.5rem] items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/60 sm:max-w-none sm:px-3">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                              <span className="leading-tight">{t('مسدَّد بالكامل', 'Fully paid')}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditObligation(row)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-colors hover:border-border hover:bg-surface hover:text-brand"
                            aria-label={t('تعديل', 'Edit')}
                          >
                            <Pencil size={18} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteObligation(row)}
                            disabled={deletingId === row.id}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-danger disabled:opacity-50"
                            aria-label={t('حذف', 'Delete')}
                          >
                            {deletingId === row.id ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Trash2 size={18} strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                          <span>{t('التقدم', 'Progress')}</span>
                          <span dir="ltr" className="tabular-nums text-slate-600">
                            {isPaid ? '100%' : `${pct.toFixed(0)}%`}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300',
                              isPaid ? 'bg-emerald-500' : 'bg-amber-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-slate-50 pt-3 text-xs text-muted">
                        <span>
                          {t('الإجمالي:', 'Total:')}{' '}
                          <span className="font-bold text-slate-800 tabular-nums" dir="ltr">
                            {formatMoney(total, locale)}
                          </span>
                        </span>
                        <span>
                          {t('المسدَّد:', 'Paid:')}{' '}
                          <span className="font-bold text-slate-700 tabular-nums" dir="ltr">
                            {formatMoney(paid, locale)}
                          </span>
                        </span>
                        <span>
                          {t('المتبقي:', 'Remaining:')}{' '}
                          <span
                            className={cn(
                              'font-bold tabular-nums',
                              rem > 0.0001 ? 'text-amber-600' : 'text-emerald-600'
                            )}
                            dir="ltr"
                          >
                            {formatMoney(rem, locale)}
                          </span>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <GeneralOutflowModal
        open={generalModal}
        onClose={() => {
          setGeneralModal(false)
          setEditingOutflow(null)
        }}
        onSaved={reload}
        edit={editingOutflow}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <ObligationFormModal
        open={obligationFormOpen}
        onClose={() => {
          setObligationFormOpen(false)
          setEditingObligation(null)
        }}
        onSaved={reload}
        edit={editingObligation}
        markerPaidSum={
          editingObligation
            ? sumLegacyMarkerPayments(outflowsForObligationMarkers, editingObligation.id)
            : 0
        }
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <ObligationPayModal
        open={payObligation != null}
        onClose={() => setPayObligation(null)}
        onSaved={reload}
        obligation={payObligation}
        markerPaidSum={
          payObligation
            ? sumLegacyMarkerPayments(outflowsForObligationMarkers, payObligation.id)
            : 0
        }
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />
    </div>
  )
}
