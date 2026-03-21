'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Investment } from '@/types/database'
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  investment: Investment | null
  periodStart: Date
  periodEnd: Date
}

export function InvestmentCloseModal({ open, onClose, onSaved, investment, periodStart, periodEnd }: Props) {
  const { t, locale } = useLanguage()
  const [exitAmountStr, setExitAmountStr] = useState('')
  const [exitDate, setExitDate] = useState(() => dateToLocalISODate(periodStart))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    setExitAmountStr('')
    setExitDate(minD)
  }, [open, minD])

  const profitLoss = useMemo(() => {
    if (!investment) return null
    const entry = Number(investment.entry_amount)
    const exit = parseFloat(exitAmountStr.replace(/,/g, ''))
    if (Number.isNaN(exit)) return null
    return exit - entry
  }, [exitAmountStr, investment])

  if (!open || !investment) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!investment) return
    const inv = investment

    const num = parseFloat(exitAmountStr.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('أدخل قيمة إغلاق صالحة', 'Enter a valid closing amount'))
      return
    }
    if (!exitDate) {
      setError(t('حدد تاريخ الإغلاق', 'Please set the closing date'))
      return
    }
    if (exitDate < minD || exitDate > maxD) {
      setError(
        t('تاريخ الإغلاق يجب أن يكون ضمن الفترة المالية الحالية', 'Closing date must be within the current period')
      )
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

    setSaving(true)
    const { error: updErr } = await supabase.from('investments').update({
      status: 'closed',
      exit_amount: num,
      exit_date: exitDate,
    }).eq('id', inv.id)

    if (updErr) {
      setError(updErr.message)
      setSaving(false)
      return
    }

    const { error: txErr } = await (supabase as any).from('investment_wallet_transactions').insert({
      user_id: user.id,
      type: 'deal_close',
      amount: num,
      date: exitDate,
      investment_id: inv.id,
    })

    if (txErr) {
      setError(txErr.message)
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
        aria-labelledby="close-modal-title"
        className={cn('relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl', 'max-h-[90vh] overflow-y-auto')}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="close-modal-title" className="text-lg font-bold text-slate-900">
            {t('إغلاق الصفقة', 'Close deal')}
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
            {locale === 'ar' ? investment.name_ar : investment.name_en}
          </p>
          <p className="mt-1 text-muted">
            {t('الربح/الخسارة:', 'Profit/Loss:')}{' '}
            <span
              className={cn(
                'font-bold tabular-nums',
                profitLoss == null ? 'text-slate-700' : profitLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'
              )}
              dir="ltr"
            >
              {profitLoss == null ? '—' : formatMoney(profitLoss, locale)}
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="close-amount" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('قيمة الإغلاق', 'Closing value')}
            </label>
            <input
              id="close-amount"
              type="text"
              inputMode="decimal"
              value={exitAmountStr}
              onChange={(e) => setExitAmountStr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="close-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ الإغلاق', 'Closing date')}
            </label>
            <input
              id="close-date"
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
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
              {saving ? t('جاري الإغلاق…', 'Closing…') : t('تأكيد الإغلاق', 'Confirm close')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

