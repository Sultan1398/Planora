'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { SavingsGoal } from '@/types/database'
import { dateToLocalISODate, defaultDateInPeriod } from '@/lib/date-local'
import { computeAvailableCash } from '@/lib/cash-liquidity'
import { formatMoney } from '@/lib/format-money'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  goal: SavingsGoal | null
  mode: 'deposit' | 'withdrawal'
  periodStart: Date
  periodEnd: Date
}

export function SavingsTransactionModal({
  open,
  onClose,
  onSaved,
  goal,
  mode,
  periodStart,
  periodEnd,
}: Props) {
  const { t, locale } = useLanguage()
  const [amount, setAmount] = useState('')
  const [dateStr, setDateStr] = useState(() => defaultDateInPeriod(periodStart, periodEnd))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [availableCash, setAvailableCash] = useState<number | null>(null)

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  useEffect(() => {
    if (!open || !goal) return
    setError('')
    setAmount('')
    setDateStr(defaultDateInPeriod(periodStart, periodEnd))

    let cancelled = false
    if (mode === 'deposit') {
      ;(async () => {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || cancelled) return
        try {
          const a = await computeAvailableCash(supabase, user.id, minD, maxD)
          if (!cancelled) setAvailableCash(a)
        } catch {
          if (!cancelled) setAvailableCash(null)
        }
      })()
    } else {
      setAvailableCash(null)
    }
    return () => {
      cancelled = true
    }
  }, [open, goal, mode, periodStart, periodEnd, minD, maxD])

  if (!open || !goal) return null

  const activeGoal = goal
  const startDateGoal = activeGoal.start_date ?? activeGoal.created_at.slice(0, 10)
  const endDateGoal = activeGoal.target_date
  const current = Number(activeGoal.current_amount)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const num = parseFloat(amount.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('أدخل مبلغاً صالحاً', 'Enter a valid amount'))
      return
    }
    if (dateStr < minD || dateStr > maxD) {
      setError(
        t('التاريخ يجب أن يكون ضمن الفترة المالية الحالية', 'Date must be within the current financial period')
      )
      return
    }
    if (startDateGoal && dateStr < startDateGoal) {
      setError(
        t('التاريخ لا يمكن أن يكون قبل بداية الهدف', 'Date cannot be before the goal start date')
      )
      return
    }
    if (endDateGoal && dateStr > endDateGoal) {
      setError(
        t('التاريخ لا يمكن أن يكون بعد تاريخ إغلاق الهدف', 'Date cannot be after the goal closing date')
      )
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError(t('يجب تسجيل الدخول', 'You must be signed in'))
        return
      }

      if (mode === 'withdrawal') {
        if (num > current + 0.0001) {
          setError(t('المبلغ أكبر من رصيد الهدف', 'Amount exceeds the goal balance'))
          return
        }
      } else {
        const available = await computeAvailableCash(supabase, user.id, minD, maxD)
        if (num > available + 0.0001) {
          setError(
            t(
              'لا توجد سيولة كافية في المحفظة لهذا الإيداع.',
              'Insufficient wallet balance for this deposit.'
            )
          )
          return
        }
      }

      const { error: insErr } = await supabase.from('savings_transactions').insert({
        user_id: user.id,
        goal_id: activeGoal.id,
        type: mode,
        amount: num,
        date: dateStr,
      })
      if (insErr) {
        setError(insErr.message)
        return
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label={t('إغلاق', 'Close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stx-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="stx-title" className="text-lg font-bold text-slate-900">
            {mode === 'deposit'
              ? t('إيداع في الهدف', 'Deposit to goal')
              : t('سحب من الهدف إلى المحفظة', 'Withdraw to wallet')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface transition-colors"
            aria-label={t('إغلاق', 'Close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-border bg-surface/50 px-5 py-3 text-sm">
          <p className="font-semibold text-slate-900">{locale === 'ar' ? activeGoal.name_ar : activeGoal.name_en}</p>
          <p className="mt-1 text-muted">
            {t('الرصيد الحالي:', 'Current balance:')}{' '}
            <span className="font-bold text-foreground tabular-nums" dir="ltr">
              {formatMoney(current, locale)}
            </span>
          </p>
          {mode === 'deposit' && availableCash != null ? (
            <p className="mt-1 text-xs text-muted">
              {t('السيولة المتاحة في الفترة:', 'Available in period:')}{' '}
              <span className="font-semibold tabular-nums" dir="ltr">
                {formatMoney(availableCash, locale)}
              </span>
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="stx-amt" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('المبلغ', 'Amount')}
            </label>
            <input
              id="stx-amt"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="stx-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('التاريخ', 'Date')}
            </label>
            <input
              id="stx-date"
              type="date"
              min={minD}
              max={maxD}
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            />
          </div>
          {mode === 'withdrawal' ? (
            <p className="text-xs text-muted leading-relaxed">
              {t(
                'يُسجَّل السحب في الفترة الحالية ويُعاد المبلغ إلى السيولة المتاحة في المحفظة (نفس الفترة).',
                'The withdrawal is recorded in the current period and adds back to your wallet liquidity for this period.'
              )}
            </p>
          ) : (
            <p className="text-xs text-muted leading-relaxed">
              {t(
                'يُخصم الإيداع من السيولة المتاحة في المحفظة ضمن هذه الفترة المالية.',
                'Deposits reduce available wallet liquidity within this financial period.'
              )}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-slate-700 hover:bg-surface transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || (mode === 'withdrawal' && current <= 0)}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-dark transition-colors disabled:opacity-60"
            >
              {saving ? t('جاري التسجيل…', 'Saving…') : t('تأكيد', 'Confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
