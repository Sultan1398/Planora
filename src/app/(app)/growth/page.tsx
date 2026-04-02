'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Money as MoneyBag, Vault, Plus as PhosphorPlus } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { GrowthWalletTransactionModal } from '@/components/growth/GrowthWalletTransactionModal'
import { SavingsGoalFormModal } from '@/components/growth/SavingsGoalFormModal'
import { SavingsTransactionModal } from '@/components/growth/SavingsTransactionModal'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseLocalISODate } from '@/lib/date-local'
import { formatGregorianDate } from '@/lib/period'
import { formatMoney } from '@/lib/format-money'
import { deleteSavingsGoalWithOrderedTxRemoval } from '@/lib/savings-delete-goal'
import type { SavingsGoal } from '@/types/database'
import { cn } from '@/lib/utils'
import { useAvailableCash } from '@/hooks/useAvailableCash'

const growthNav = getAppNavItem('/growth')

export default function GrowthPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [growthWalletBalance, setGrowthWalletBalance] = useState(0)
  const [fetchError, setFetchError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [txGoal, setTxGoal] = useState<SavingsGoal | null>(null)
  const [txMode, setTxMode] = useState<'deposit' | 'withdrawal'>('deposit')
  const [walletTxOpen, setWalletTxOpen] = useState(false)
  const [walletTxMode, setWalletTxMode] = useState<'deposit' | 'withdrawal'>('deposit')

  const { availableCash, loading: cashLoading } = useAvailableCash({ periodKey, periodDates, startDay })

  const fetchGrowthData = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setLoading(true)
    setFetchError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isStillMounted()) return
    if (!user) {
      setGoals([])
      setGrowthWalletBalance(0)
      setLoading(false)
      return
    }

    const uid = user.id

    const { data: walletData, error: walletError } = await supabase.from('growth_wallets').select('balance').single()

    if (!walletError && walletData) {
      setGrowthWalletBalance(Number(walletData.balance) || 0)
    }

    const goalsRes = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    if (!isStillMounted()) return

    const errs: string[] = []
    if (goalsRes.error) errs.push(goalsRes.error.message)
    if (walletError && walletError.code !== 'PGRST116') errs.push(walletError.message)
    setFetchError(errs.join(' · '))

    setGoals(goalsRes.error ? [] : ((goalsRes.data as SavingsGoal[] | null) ?? []))
    setLoading(false)
  }, [])

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    const loadData = async () => {
      await fetchGrowthData(isStillMounted)
    }
    void loadData()
    return () => {
      isMounted = false
    }
  }, [fetchGrowthData, periodKey])

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
    const shouldReturnToWallet = bal > 0.0001
    if (shouldReturnToWallet) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setDeletingId(null)
        alert(t('يجب تسجيل الدخول', 'You must be signed in'))
        return
      }
      // return goal balance to growth wallet before closing/deleting it
      const { error: walletTxErr } = await supabase.from('growth_wallet_transactions').insert({
        user_id: user.id,
        amount: bal,
        transaction_type: 'deposit',
      })
      if (walletTxErr) {
        setDeletingId(null)
        alert(walletTxErr.message)
        return
      }
    }
    const { error: delErr } = await deleteSavingsGoalWithOrderedTxRemoval(supabase, g.id)
    setDeletingId(null)
    if (delErr) {
      if (shouldReturnToWallet) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          // compensate wallet if deletion failed
          await supabase.from('growth_wallet_transactions').insert({
            user_id: user.id,
            amount: bal,
            transaction_type: 'withdrawal',
          })
        }
      }
      alert(delErr.message)
      return
    }
    void fetchGrowthData()
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        nav={growthNav}
        subtitle={t('إدارة صناديق وأهداف الادخار الخاصة بك', 'Manage your savings funds and goals')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PeriodNavigator />
          </div>
        }
      />

      {loading ? (
        <div className="mt-8 flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500 shadow-sm">
          {t('جارِ التحميل...', 'Loading...')}
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {fetchError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {fetchError}
            </div>
          ) : null}

      {!loading && !cashLoading && availableCash != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1B6EF3] bg-[#1B6EF3] px-4 py-3 shadow-sm">
          <span className="text-sm text-white">{t('السيولة المتاحة في الفترة', 'Available liquidity this period')}</span>
          <span className="text-lg font-bold text-white tabular-nums" dir="ltr">
            {formatMoney(availableCash, locale)}
          </span>
        </div>
      ) : null}

      {/* بطاقة محفظة النمو (النسخة المبسطة) */}
      <div className="mb-8 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center md:p-8">
          <div className="flex flex-col items-start">
            <div className="mb-2 flex items-center gap-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <Vault weight="duotone" className="h-5 w-5 text-[#2563EB]" aria-hidden />
              </div>
              <h2 className="text-sm font-bold text-gray-500">
                {t('رصيد محفظة النمو (الادخار)', 'Growth Wallet Balance (Savings)')}
              </h2>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
              <span className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl" dir="ltr">
                {formatMoney(growthWalletBalance, locale)}
              </span>
            </div>
          </div>

          <div className="mt-4 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mt-0">
            <button
              type="button"
              onClick={() => {
                setWalletTxMode('withdrawal')
                setWalletTxOpen(true)
              }}
              className="flex items-center justify-center gap-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 rotate-[135deg]" aria-hidden />
              {t('استرجاع للمحفظة', 'Withdraw')}
            </button>
            <button
              type="button"
              onClick={() => {
                setWalletTxMode('deposit')
                setWalletTxOpen(true)
              }}
              className="flex items-center justify-center gap-x-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
            >
              <PhosphorPlus weight="bold" className="h-5 w-5" aria-hidden />
              {t('إيداع من المحفظة', 'Deposit')}
            </button>
          </div>
        </div>
      </div>

      <div className={cn('flex flex-col gap-8', locale === 'ar' ? 'text-right' : 'text-left')}>
        {/* قسم صناديق الادخار الرئيسي */}
        <div className="mb-4 mt-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <MoneyBag weight="duotone" className="h-6 w-6 text-[#2563EB]" aria-hidden />
            </div>
            <h2 className="text-xl font-bold text-[#1F2937]">{t('صناديق الادخار', 'Savings Funds')}</h2>
          </div>
          <button
            type="button"
            onClick={openNewGoal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2563EB]/10 px-4 py-2 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB]/20"
          >
            <PhosphorPlus weight="bold" className="h-4 w-4" aria-hidden />
            {t('هدف جديد', 'New Goal')}
          </button>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-16 text-center">
              <MoneyBag weight="duotone" className="mb-4 h-16 w-16 text-gray-300" aria-hidden />
              <p className="mb-5 font-medium text-gray-500">
                {t('لا توجد أهداف ادخارية مسجلة حالياً.', 'No savings goals registered yet.')}
              </p>
              <button
                type="button"
                onClick={openNewGoal}
                className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {t('+ أضف هدفك الأول', '+ Add your first goal')}
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-6" role="list">
              {goals.map((g) => {
                const target = Number(g.target_amount)
                const cur = Number(g.current_amount)
                const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0
                const startD = g.start_date ?? g.created_at.slice(0, 10)
                const endD = g.target_date
                return (
                  <li
                    key={g.id}
                    className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
                  >
                    <div className="flex flex-col gap-3 border-b border-[#E5E7EB] pb-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-[#1F2937]">
                          {locale === 'ar' ? g.name_ar : g.name_en}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
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
                          className="inline-flex items-center gap-1 rounded-lg bg-[#10B981]/15 px-2.5 py-1.5 text-xs font-bold text-[#059669] hover:bg-[#10B981]/25"
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                          {t('إيداع', 'Deposit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openWithdraw(g)}
                          disabled={cur <= 0.0001}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-bold text-[#374151] hover:bg-white disabled:opacity-40"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          {t('سحب', 'Withdraw')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditGoal(g)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-white hover:text-[#2563EB]"
                          aria-label={t('تعديل', 'Edit')}
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(g)}
                          disabled={deletingId === g.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-red-50 hover:text-[#EF4444] disabled:opacity-50"
                          aria-label={t('حذف', 'Delete')}
                        >
                          {deletingId === g.id ? (
                            <Loader2 className="h-[18px] w-[18px] animate-spin" />
                          ) : (
                            <Trash2 className="h-[18px] w-[18px]" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                        <span>{t('التقدم', 'Progress')}</span>
                        <span dir="ltr" className="tabular-nums text-[#374151]">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                        <div
                          className={cn(
                            'h-full rounded-full bg-[#2563EB] transition-all duration-300',
                            pct >= 100 && 'bg-[#10B981]'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#E5E7EB] pt-3 text-xs text-[#6B7280]">
                      <span>
                        {t('المستهدف:', 'Target:')}{' '}
                        <span className="font-bold text-[#111827] tabular-nums" dir="ltr">
                          {formatMoney(target, locale)}
                        </span>
                      </span>
                      <span>
                        {t('الرصيد:', 'Saved:')}{' '}
                        <span className="font-bold text-[#374151] tabular-nums" dir="ltr">
                          {formatMoney(cur, locale)}
                        </span>
                      </span>
                      <span>
                        {t('المتبقي:', 'Remaining:')}{' '}
                        <span className="font-bold tabular-nums text-[#D97706]" dir="ltr">
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
      </div>
        </div>
      )}

      <SavingsGoalFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingGoal(null)
        }}
        onSaved={() => void fetchGrowthData()}
        edit={editingGoal}
      />

      <SavingsTransactionModal
        open={txOpen}
        onClose={() => {
          setTxOpen(false)
          setTxGoal(null)
        }}
        onSaved={() => void fetchGrowthData()}
        goal={txGoal}
        mode={txMode}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <GrowthWalletTransactionModal
        open={walletTxOpen}
        onClose={() => setWalletTxOpen(false)}
        onSaved={() => void fetchGrowthData()}
        mode={walletTxMode}
      />
    </div>
  )
}