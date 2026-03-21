'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { computeInvestmentInternalBalance } from '@/lib/investment-ledger'
import { computeWalletCashNow } from '@/lib/cash-liquidity'
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  mode: 'deposit' | 'withdrawal'
  periodStart: Date
  periodEnd: Date
}

export function InvestmentWalletTransferModal({ open, onClose, onSaved, mode, periodStart, periodEnd }: Props) {
  const { t, locale } = useLanguage()
  const [amountStr, setAmountStr] = useState('')
  const [dateStr, setDateStr] = useState(() => dateToLocalISODate(periodStart))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [walletNow, setWalletNow] = useState<number | null>(null)
  const [internalNow, setInternalNow] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setAmountStr('')
    setDateStr(dateToLocalISODate(periodStart))
    setWalletNow(null)
    setInternalNow(null)

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      try {
        const [w, i] = await Promise.all([computeWalletCashNow(supabase, user.id), computeInvestmentInternalBalance(supabase, user.id)])
        if (!cancelled) {
          setWalletNow(w)
          setInternalNow(i)
        }
      } catch {
        if (!cancelled) {
          setWalletNow(null)
          setInternalNow(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  const title = useMemo(() => {
    if (mode === 'deposit') return t('إيداع للاستثمارات', 'Deposit to investments')
    return t('سحب من الاستثمارات', 'Withdraw from investments')
  }, [mode, t])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const num = parseFloat(amountStr.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('أدخل مبلغاً صالحاً', 'Enter a valid amount'))
      return
    }
    if (!dateStr) {
      setError(t('حدد التاريخ', 'Please set the date'))
      return
    }
    if (dateStr < minD || dateStr > maxD) {
      setError(t('التاريخ يجب أن يكون ضمن الفترة المالية الحالية', 'Date must be within the current period'))
      return
    }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError(t('يجب تسجيل الدخول', 'You must be signed in'))
      return
    }

    try {
      if (mode === 'deposit') {
        const w = await computeWalletCashNow(supabase, user.id)
        if (num > w + 0.0001) {
          setError(t('لا توجد سيولة كافية في المحفظة لهذا الإيداع', 'Insufficient wallet liquidity for this deposit'))
          return
        }
      } else {
        const i = await computeInvestmentInternalBalance(supabase, user.id)
        if (num > i + 0.0001) {
          setError(t('لا توجد سيولة كافية داخل قسم الاستثمارات لهذا السحب', 'Insufficient internal investment balance for this withdrawal'))
          return
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      return
    }

    setSaving(true)
    const { error: insErr } = await (supabase as any).from('investment_wallet_transactions').insert({
      user_id: user.id,
      type: mode,
      amount: num,
      date: dateStr,
    })

    if (insErr) {
      setError(insErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
    onClose()
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
        aria-labelledby="inv-tx-title"
        className={cn('relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl', 'max-h-[90vh] overflow-y-auto')}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="inv-tx-title" className="text-lg font-bold text-slate-900">
            {title}
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
          <p className="font-semibold text-slate-900">
            {t('المحفظة الحالية', 'Current wallet')}
          </p>
          <p className="mt-1 text-muted">
            {walletNow == null ? '—' : <span className="font-bold tabular-nums" dir="ltr">{formatMoney(walletNow, locale)}</span>}
          </p>
          <p className="mt-2 font-semibold text-slate-900">
            {t('محفظة الاستثمارات الداخلية', 'Internal investments wallet')}
          </p>
          <p className="mt-1 text-muted">
            {internalNow == null ? '—' : <span className="font-bold tabular-nums" dir="ltr">{formatMoney(internalNow, locale)}</span>}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="inv-tx-amount" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('المبلغ', 'Amount')}
            </label>
            <input
              id="inv-tx-amount"
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="inv-tx-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('التاريخ', 'Date')}
            </label>
            <input
              id="inv-tx-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            />
          </div>

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
              disabled={saving}
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

