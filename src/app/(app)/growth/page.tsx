'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Vault, Money as MoneyBag, Bank, Buildings, CaretUp, CaretDown } from '@phosphor-icons/react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { FixedAssetModal, displayAssetType } from '@/components/growth/FixedAssetModal'
import { FixedDepositModal } from '@/components/growth/FixedDepositModal'
import { GrowthWalletTransactionModal } from '@/components/growth/GrowthWalletTransactionModal'
import { SavingsGoalFormModal } from '@/components/growth/SavingsGoalFormModal'
import { SavingsTransactionModal } from '@/components/growth/SavingsTransactionModal'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseLocalISODate } from '@/lib/date-local'
import { formatGregorianDate } from '@/lib/period'
import { formatMoney } from '@/lib/format-money'
import { deleteSavingsGoalWithOrderedTxRemoval } from '@/lib/savings-delete-goal'
import type { FixedAsset, FixedDeposit, SavingsGoal } from '@/types/database'
import { cn } from '@/lib/utils'
import { useAvailableCash } from '@/hooks/useAvailableCash'

const growthNav = getAppNavItem('/growth')

export default function GrowthPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()
  const [loading, setLoading] = useState(true)
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [fixedDeposits, setFixedDeposits] = useState<FixedDeposit[]>([])
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([])
  const [growthWalletBalance, setGrowthWalletBalance] = useState(0)
  const [fetchError, setFetchError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDepositId, setDeletingDepositId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [txGoal, setTxGoal] = useState<SavingsGoal | null>(null)
  const [txMode, setTxMode] = useState<'deposit' | 'withdrawal'>('deposit')
  const [walletTxOpen, setWalletTxOpen] = useState(false)
  const [walletTxMode, setWalletTxMode] = useState<'deposit' | 'withdrawal'>('deposit')

  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [editingDeposit, setEditingDeposit] = useState<FixedDeposit | null>(null)
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null)

  // حالات فتح وإغلاق الأقسام
  const [isSavingsOpen, setIsSavingsOpen] = useState(true)
  const [isDepositsOpen, setIsDepositsOpen] = useState(true)
  const [isAssetsOpen, setIsAssetsOpen] = useState(true)
  const { availableCash, loading: cashLoading } = useAvailableCash({ periodKey, periodDates, startDay })

  // حساب الإجماليات للأقسام الثلاثة
  const totalSavings = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0)
  const totalDeposits = fixedDeposits.reduce((acc, d) => acc + Number(d.amount || 0), 0)
  const totalAssets = fixedAssets.reduce((acc, a) => acc + Number(a.estimated_value || 0), 0)

  const namedLabel = useCallback(
    (nameAr: string, nameEn: string) => (locale === 'ar' ? nameAr : nameEn),
    [locale]
  )

  const fetchGrowthData = useCallback(
    async (isStillMounted: () => boolean = () => true) => {
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
        setFixedDeposits([])
        setFixedAssets([])
        setGrowthWalletBalance(0)
        setLoading(false)
        return
      }

      const uid = user.id

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: walletData, error: walletError } = await (supabase as any)
        .from('growth_wallets')
        .select('balance')
        .single()

      if (!walletError && walletData) {
        setGrowthWalletBalance(Number(walletData.balance) || 0)
      }

      const [goalsRes, depositsRes, assetsRes] = await Promise.all([
        supabase.from('savings_goals').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase
          .from('fixed_deposits')
          .select('id, name_ar, name_en, amount, roi_percentage, start_date, due_date, status, created_at')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('fixed_assets')
          .select('id, name_ar, name_en, estimated_value, asset_type, purchase_date, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false }),
      ])

      if (!isStillMounted()) return

      const errs: string[] = []
      if (goalsRes.error) errs.push(goalsRes.error.message)
      if (depositsRes.error) errs.push(depositsRes.error.message)
      if (assetsRes.error) errs.push(assetsRes.error.message)
      if (walletError && walletError.code !== 'PGRST116') errs.push(walletError.message)
      setFetchError(errs.join(' · '))

      setGoals(goalsRes.error ? [] : ((goalsRes.data as SavingsGoal[] | null) ?? []))
      setFixedDeposits(depositsRes.error ? [] : ((depositsRes.data as FixedDeposit[] | null) ?? []))
      setFixedAssets(assetsRes.error ? [] : ((assetsRes.data as FixedAsset[] | null) ?? []))
      setLoading(false)
    },
    []
  )

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('growth_wallet_transactions').insert({
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

  function openNewDeposit() {
    setEditingDeposit(null)
    setDepositModalOpen(true)
  }

  function openEditDeposit(d: FixedDeposit) {
    setEditingDeposit(d)
    setDepositModalOpen(true)
  }

  function openNewAsset() {
    setEditingAsset(null)
    setAssetModalOpen(true)
  }

  function openEditAsset(a: FixedAsset) {
    setEditingAsset(a)
    setAssetModalOpen(true)
  }

  async function handleDeleteDeposit(d: FixedDeposit) {
    if (
      !confirm(
        t('حذف هذه الوديعة؟ لا يمكن التراجع.', 'Delete this deposit? This cannot be undone.')
      )
    )
      return
    setDeletingDepositId(d.id)
    const supabase = createClient()
    const amount = Number(d.amount || 0)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setDeletingDepositId(null)
      alert(t('يجب تسجيل الدخول', 'You must be signed in'))
      return
    }
    // return deposit amount to growth wallet on close/delete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
      user_id: user.id,
      amount,
      transaction_type: 'deposit',
    })
    if (walletTxErr) {
      setDeletingDepositId(null)
      alert(walletTxErr.message)
      return
    }
    const { error: delErr } = await supabase.from('fixed_deposits').delete().eq('id', d.id)
    setDeletingDepositId(null)
    if (delErr) {
      // compensate wallet if deletion fails
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('growth_wallet_transactions').insert({
        user_id: user.id,
        amount,
        transaction_type: 'withdrawal',
      })
      alert(delErr.message)
      return
    }
    void fetchGrowthData()
  }

  async function handleDeleteAsset(a: FixedAsset) {
    if (
      !confirm(
        t('حذف هذا الأصل؟ لا يمكن التراجع.', 'Delete this asset? This cannot be undone.')
      )
    )
      return
    setDeletingAssetId(a.id)
    const supabase = createClient()
    const amount = Number(a.estimated_value || 0)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setDeletingAssetId(null)
      alert(t('يجب تسجيل الدخول', 'You must be signed in'))
      return
    }
    // return asset value to growth wallet on close/delete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
      user_id: user.id,
      amount,
      transaction_type: 'deposit',
    })
    if (walletTxErr) {
      setDeletingAssetId(null)
      alert(walletTxErr.message)
      return
    }
    const { error: delErr } = await supabase.from('fixed_assets').delete().eq('id', a.id)
    setDeletingAssetId(null)
    if (delErr) {
      // compensate wallet if deletion fails
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('growth_wallet_transactions').insert({
        user_id: user.id,
        amount,
        transaction_type: 'withdrawal',
      })
      alert(delErr.message)
      return
    }
    void fetchGrowthData()
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        nav={growthNav}
        subtitle={t('أهداف ادخار، ودائع، وأصول ثابتة', 'Savings goals, deposits, and fixed assets')}
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

      {/* محفظة النمو الداخلية ولوحة الإجماليات */}
      <div className="flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02]">
        {/* الجزء العلوي: الرصيد والأزرار */}
        <div className="relative flex flex-col justify-between gap-4 bg-gradient-to-b from-blue-50/40 to-white p-5 md:flex-row md:items-center">
          <div className="pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full bg-blue-100/50 blur-2xl" />
          <div className="relative flex flex-col items-start">
            <div className="mb-2 flex items-center gap-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
                <Vault weight="duotone" className="h-5 w-5 text-[#2563EB]" aria-hidden />
              </div>
              <h2 className="text-sm font-bold text-gray-500">
                {t('رصيد محفظة النمو', 'Growth wallet balance')}
              </h2>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
              <span className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl" dir="ltr">
                {formatMoney(growthWalletBalance, locale)}
              </span>
            </div>
          </div>

          <div className="relative mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center md:mt-0">
            <button
              type="button"
              onClick={() => {
                setWalletTxMode('withdrawal')
                setWalletTxOpen(true)
              }}
              className="flex items-center justify-center gap-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 rotate-[135deg]" aria-hidden />
              {t('سحب', 'Withdraw')}
            </button>
            <button
              type="button"
              onClick={() => {
                setWalletTxMode('deposit')
                setWalletTxOpen(true)
              }}
              className="flex items-center justify-center gap-x-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t('إيداع', 'Deposit')}
            </button>
          </div>
        </div>

        {/* الجزء السفلي: إجماليات الأقسام */}
        <div className="grid grid-cols-1 border-t border-gray-100 bg-white sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-emerald-600">{t('إجمالي صناديق الادخار', 'Total Savings')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(totalSavings, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-emerald-600">{t('إجمالي الودائع والعوائد', 'Total Deposits')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(totalDeposits, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-sm font-medium text-emerald-600">{t('إجمالي الأصول الثابتة', 'Total Fixed Assets')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(totalAssets, locale)}
            </p>
          </div>
        </div>
      </div>

      <div className={cn('flex flex-col gap-8', locale === 'ar' ? 'text-right' : 'text-left')}>
        {/* صناديق الادخار */}
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsSavingsOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
              aria-expanded={isSavingsOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B]/10">
                <MoneyBag weight="duotone" className="h-6 w-6 text-[#F59E0B]" aria-hidden />
              </div>
              <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
                {t('صناديق الادخار', 'Savings funds')}
              </h2>
              {isSavingsOpen ? (
                <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              ) : (
                <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={openNewGoal}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2563EB]/10 px-4 py-2 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB]/20"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('إضافة هدف', 'Add Goal')}
            </button>
          </div>

          {isSavingsOpen && (
            <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
              {goals.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center">
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
                <ul className="flex flex-col gap-4" role="list">
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
          )}
        </section>

        {/* الودائع */}
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsDepositsOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
              aria-expanded={isDepositsOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B]/10">
                <Bank weight="duotone" className="h-6 w-6 text-[#F59E0B]" aria-hidden />
              </div>
              <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
                {t('الودائع والعوائد الثابتة', 'Fixed deposits & returns')}
              </h2>
              {isDepositsOpen ? (
                <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              ) : (
                <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={openNewDeposit}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2563EB]/10 px-4 py-2 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB]/20"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('إضافة وديعة', 'Add Deposit')}
            </button>
          </div>

          {isDepositsOpen && (
            <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
              {fixedDeposits.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center">
                  <Bank weight="duotone" className="mb-4 h-16 w-16 text-gray-300" aria-hidden />
                  <p className="mb-5 font-medium text-gray-500">
                    {t('لا توجد ودائع مسجلة حالياً.', 'No fixed deposits registered yet.')}
                  </p>
                  <button
                    type="button"
                    onClick={openNewDeposit}
                    className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    {t('+ أضف وديعتك الأولى', '+ Add your first deposit')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {fixedDeposits.map((deposit) => (
                  <div key={deposit.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="text-start text-lg font-bold text-[#1F2937]">
                        {namedLabel(deposit.name_ar, deposit.name_en)}
                      </h3>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDeposit(deposit)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-white hover:text-[#2563EB]"
                          aria-label={t('تعديل', 'Edit')}
                        >
                          <Pencil className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDeposit(deposit)}
                          disabled={deletingDepositId === deposit.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-red-50 hover:text-[#EF4444] disabled:opacity-50"
                          aria-label={t('حذف', 'Delete')}
                        >
                          {deletingDepositId === deposit.id ? (
                            <Loader2 className="h-[18px] w-[18px] animate-spin" />
                          ) : (
                            <Trash2 className="h-[18px] w-[18px]" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-sm text-[#6B7280] sm:flex-row sm:items-center sm:justify-between">
                      <p dir="ltr">
                        {t('المبلغ:', 'Amount:')}{' '}
                        <span className="font-medium text-[#1F2937]">
                          {formatMoney(Number(deposit.amount), locale)}
                        </span>
                      </p>
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981]/10 px-2.5 py-1 text-xs font-bold text-[#059669]">
                        <ArrowLeft className="h-3.5 w-3.5 rotate-[-135deg]" aria-hidden />
                        {t('العائد السنوي:', 'Annual yield:')} {Number(deposit.roi_percentage)}%
                      </div>
                    </div>
                    <p className="mt-3 border-t border-[#E5E7EB] pt-2 text-start text-xs text-[#6B7280]">
                      {t('تاريخ البدء:', 'Start:')}{' '}
                      <span dir="ltr" className="tabular-nums">
                        {deposit.start_date
                          ? formatGregorianDate(parseLocalISODate(deposit.start_date.slice(0, 10)), locale)
                          : '—'}
                      </span>
                      {' · '}
                      {t('تاريخ الاستحقاق:', 'Due:')}{' '}
                      <span dir="ltr" className="tabular-nums">
                        {formatGregorianDate(parseLocalISODate(deposit.due_date.slice(0, 10)), locale)}
                      </span>
                    </p>
                  </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* الأصول الثابتة */}
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsAssetsOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
              aria-expanded={isAssetsOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B]/10">
                <Buildings weight="duotone" className="h-6 w-6 text-[#F59E0B]" aria-hidden />
              </div>
              <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
                {t('الأصول الثابتة', 'Fixed assets')}
              </h2>
              {isAssetsOpen ? (
                <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              ) : (
                <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={openNewAsset}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2563EB]/10 px-4 py-2 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB]/20"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('إضافة أصل', 'Add Asset')}
            </button>
          </div>

          {isAssetsOpen && (
            <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
              {fixedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-50 px-6 py-12 text-center">
                  <Buildings weight="duotone" className="mb-4 h-16 w-16 text-gray-300" aria-hidden />
                  <p className="mb-5 font-medium text-gray-500">
                    {t('لا توجد أصول ثابتة مسجلة حالياً.', 'No fixed assets registered yet.')}
                  </p>
                  <button
                    type="button"
                    onClick={openNewAsset}
                    className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    {t('+ أضف أصلك الأول', '+ Add your first asset')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {fixedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:flex-row sm:items-start"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <h3 className="text-start text-lg font-bold text-[#1F2937]">
                          {namedLabel(asset.name_ar, asset.name_en)}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditAsset(asset)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-white hover:text-[#2563EB]"
                            aria-label={t('تعديل', 'Edit')}
                          >
                            <Pencil className="h-[18px] w-[18px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset(asset)}
                            disabled={deletingAssetId === asset.id}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6B7280] hover:bg-red-50 hover:text-[#EF4444] disabled:opacity-50"
                            aria-label={t('حذف', 'Delete')}
                          >
                            {deletingAssetId === asset.id ? (
                              <Loader2 className="h-[18px] w-[18px] animate-spin" />
                            ) : (
                              <Trash2 className="h-[18px] w-[18px]" />
                            )}
                          </button>
                        </div>
                      </div>
                      <span className="mt-1 inline-block rounded bg-[#E5E7EB] px-2 py-0.5 text-xs text-[#6B7280]">
                        {displayAssetType(t, asset.asset_type)}
                      </span>
                      <p className="mt-2 text-start text-xs text-[#6B7280]">
                        {t('تاريخ الشراء:', 'Purchase:')}{' '}
                        <span dir="ltr" className="tabular-nums">
                          {asset.purchase_date
                            ? formatGregorianDate(parseLocalISODate(asset.purchase_date.slice(0, 10)), locale)
                            : '—'}
                        </span>
                      </p>
                    </div>
                    <div
                      className="shrink-0 self-start rounded-lg bg-[#E5E7EB] px-3 py-1.5 text-sm font-bold text-[#1F2937] tabular-nums sm:self-center"
                      dir="ltr"
                    >
                      {formatMoney(Number(asset.estimated_value), locale)}
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
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

      <FixedDepositModal
        open={depositModalOpen}
        onClose={() => {
          setDepositModalOpen(false)
          setEditingDeposit(null)
        }}
        onSaved={() => void fetchGrowthData()}
        edit={editingDeposit}
      />

      <FixedAssetModal
        open={assetModalOpen}
        onClose={() => {
          setAssetModalOpen(false)
          setEditingAsset(null)
        }}
        onSaved={() => void fetchGrowthData()}
        edit={editingAsset}
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