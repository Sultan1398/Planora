'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { formatGregorianDate } from '@/lib/period'
import { formatMoney } from '@/lib/format-money'
import { computeAvailableCash } from '@/lib/cash-liquidity'
import { deleteSavingsGoalWithOrderedTxRemoval } from '@/lib/savings-delete-goal'
import type { SavingsGoal } from '@/types/database'
import { SavingsGoalFormModal } from '@/components/savings/SavingsGoalFormModal'
import { SavingsTransactionModal } from '@/components/savings/SavingsTransactionModal'
import { PiggyBank, Pencil, Trash2, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const savingsNav = getAppNavItem('/savings')

export default function SavingsPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates } = usePeriod()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [availableCash, setAvailableCash] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)

  const [txOpen, setTxOpen] = useState(false)
  const [txGoal, setTxGoal] = useState<SavingsGoal | null>(null)
  const [txMode, setTxMode] = useState<'deposit' | 'withdrawal'>('deposit')

  const start = dateToLocalISODate(periodDates.start)
  const end = dateToLocalISODate(periodDates.end)

  const reload = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isStillMounted()) return
    if (!user) {
      setGoals([])
      setAvailableCash(null)
      setLoading(false)
      return
    }

    const [gRes, cash] = await Promise.all([
      supabase.from('savings_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      computeAvailableCash(supabase, user.id, start, end).catch(() => null),
    ])

    if (!isStillMounted()) return
    if (gRes.error) {
      setError(gRes.error.message)
      setGoals([])
    } else {
      setGoals((gRes.data as SavingsGoal[] | null) ?? [])
    }
    setAvailableCash(cash)
    setLoading(false)
  }, [start, end])

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    void reload(isStillMounted)
    return () => {
      isMounted = false
    }
  }, [reload, periodKey])

  function openNewGoal() {
    setEditingGoal(null)
    setFormOpen(true)
  }

  function openEditGoal(g: SavingsGoal) {
    setEditingGoal(g)
    setFormOpen(true)
  }

  function openDeposit(g: SavingsGoal) {
    setTxGoal(g)
    setTxMode('deposit')
    setTxOpen(true)
  }

  function openWithdraw(g: SavingsGoal) {
    setTxGoal(g)
    setTxMode('withdrawal')
    setTxOpen(true)
  }

  async function handleDelete(g: SavingsGoal) {
    const bal = Number(g.current_amount)
    const msg =
      bal > 0.0001
        ? t(
            'حذف الهدف سيُلغي معاملاته ويُعيد أثرها على السيولة في الفترات المعنية (المبلغ يعود منطقياً للمحفظة). متابعة؟',
            'Deleting will remove transactions and restore liquidity in the affected periods (balance returns to the wallet logically). Continue?'
          )
        : t('حذف هذا الهدف؟', 'Delete this savings goal?')
    if (!confirm(msg)) return

    setDeletingId(g.id)
    const supabase = createClient()
    const { error: delErr } = await deleteSavingsGoalWithOrderedTxRemoval(supabase, g.id)
    setDeletingId(null)
    if (delErr) {
      alert(delErr.message)
      return
    }
    reload()
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        nav={savingsNav}
        subtitle={t('أهداف الادخار والمعاملات', 'Savings goals and transactions')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PeriodNavigator />
            <button
              type="button"
              onClick={openNewGoal}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              {t('+ هدف جديد', '+ New goal')}
            </button>
          </div>
        }
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

      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 via-slate-50/50 to-slate-100/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : goals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white/80 px-6 py-14 text-center text-muted">
            <PiggyBank className="mx-auto mb-3 h-10 w-10 opacity-50" aria-hidden />
            <p className="mb-4">{t('لا توجد أهداف ادخار بعد', 'No savings goals yet')}</p>
            <button
              type="button"
              onClick={openNewGoal}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              {t('إضافة هدف', 'Add a goal')}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-5 sm:gap-6" role="list">
            {goals.map((g) => {
              const target = Number(g.target_amount)
              const cur = Number(g.current_amount)
              const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0
              const startD = g.start_date ?? g.created_at.slice(0, 10)
              const endD = g.target_date
              return (
                <li
                  key={g.id}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03] transition-all duration-200 hover:border-slate-300/90 hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-slate-900">
                        {locale === 'ar' ? g.name_ar : g.name_en}
                      </h3>
                      <p className="mt-1 text-xs text-muted leading-relaxed">
                        {t('البداية:', 'Start:')}{' '}
                        <span dir="ltr" className="tabular-nums">
                          {formatGregorianDate(parseLocalISODate(startD), locale)}
                        </span>
                        {' · '}
                        {t('الإغلاق:', 'Close:')}{' '}
                        <span dir="ltr" className="tabular-nums">
                          {endD ? formatGregorianDate(parseLocalISODate(endD), locale) : '—'}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => openDeposit(g)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand/20"
                      >
                        <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                        {t('إيداع', 'Deposit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openWithdraw(g)}
                        disabled={cur <= 0.0001}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-surface disabled:opacity-40"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        {t('سحب', 'Withdraw')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditGoal(g)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-surface hover:text-brand"
                        aria-label={t('تعديل', 'Edit')}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(g)}
                        disabled={deletingId === g.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-danger disabled:opacity-50"
                        aria-label={t('حذف', 'Delete')}
                      >
                        {deletingId === g.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                      <span>{t('التقدم', 'Progress')}</span>
                      <span dir="ltr" className="tabular-nums text-slate-600">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-full rounded-full bg-brand transition-all duration-300',
                          pct >= 100 && 'bg-emerald-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-50 pt-3 text-xs text-muted">
                    <span>
                      {t('المستهدف:', 'Target:')}{' '}
                      <span className="font-bold text-slate-800 tabular-nums" dir="ltr">
                        {formatMoney(target, locale)}
                      </span>
                    </span>
                    <span>
                      {t('الرصيد:', 'Saved:')}{' '}
                      <span className="font-bold text-slate-700 tabular-nums" dir="ltr">
                        {formatMoney(cur, locale)}
                      </span>
                    </span>
                    <span>
                      {t('المتبقي:', 'Remaining:')}{' '}
                      <span className="font-bold tabular-nums text-amber-600" dir="ltr">
                        {formatMoney(Math.max(0, target - cur), locale)}
                      </span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <SavingsGoalFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingGoal(null)
        }}
        onSaved={reload}
        edit={editingGoal}
      />

      <SavingsTransactionModal
        open={txOpen}
        onClose={() => {
          setTxOpen(false)
          setTxGoal(null)
        }}
        onSaved={reload}
        goal={txGoal}
        mode={txMode}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />
    </div>
  )
}
