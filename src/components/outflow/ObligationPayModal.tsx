'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Obligation } from '@/types/database'
import { dateToLocalISODate, defaultDateInPeriod } from '@/lib/date-local'
import { computeAvailableCash } from '@/lib/cash-liquidity'
import {
  OBLIGATION_PAY_TAG,
  obligationPaidAmount,
  obligationRemaining,
  obligationUsesPaidAmountColumn,
} from '@/lib/obligation-helpers'
import { formatMoney } from '@/lib/format-money'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  obligation: Obligation | null
  /** مجموع سدادات العلامة قبل هذه الجلسة (مخطط بدون paid_amount) */
  markerPaidSum: number
  periodStart: Date
  periodEnd: Date
}

export function ObligationPayModal({
  open,
  onClose,
  onSaved,
  obligation,
  markerPaidSum,
  periodStart,
  periodEnd,
}: Props) {
  const { t, locale } = useLanguage()
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<'partial' | 'full'>('partial')
  const [dateStr, setDateStr] = useState(() => defaultDateInPeriod(periodStart, periodEnd))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [availableCash, setAvailableCash] = useState<number | null>(null)

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  const remaining = obligation ? obligationRemaining(obligation, markerPaidSum) : 0

  useEffect(() => {
    if (!open || !obligation) return
    setError('')
    setPayMode('partial')
    setPayAmount('')
    setDateStr(defaultDateInPeriod(periodStart, periodEnd))

    let cancelled = false
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
    return () => {
      cancelled = true
    }
  }, [open, obligation, periodStart, periodEnd, minD, maxD])

  if (!open || !obligation) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const obl = obligation
    if (!obl) return
    setError('')
    const rem = obligationRemaining(obl, markerPaidSum)

    let num: number
    if (payMode === 'full') {
      num = rem
    } else {
      const parsed = parseFloat(payAmount.replace(/,/g, ''))
      if (Number.isNaN(parsed) || parsed <= 0) {
        setError(t('أدخل مبلغ سداد صالحاً', 'Enter a valid payment amount'))
        return
      }
      num = parsed
      if (num > rem + 0.0001) {
        setError(
          t('المبلغ أكبر من المتبقي على الالتزام', 'Amount exceeds the remaining obligation balance')
        )
        return
      }
    }

    if (num <= 0) {
      setError(t('لا يوجد مبلغ متبقي', 'No remaining balance'))
      return
    }

    if (dateStr < minD || dateStr > maxD) {
      setError(
        t('تاريخ السداد يجب أن يكون ضمن الفترة المالية الحالية', 'Payment date must be within the current period')
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

    try {
      const available = await computeAvailableCash(supabase, user.id, minD, maxD)
      if (num > available + 0.0001) {
        setError(
          t(
            'لا توجد سيولة كافية في المحفظة لهذا السداد.',
            'Insufficient wallet balance for this payment.'
          )
        )
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      return
    }

    const usesColumn = obligationUsesPaidAmountColumn(obl)
    const suffixAr = ' — سداد التزام'
    const suffixEn = ' — obligation payment'
    const tag = OBLIGATION_PAY_TAG(obl.id)
    const name_ar = usesColumn ? `${obl.name_ar}${suffixAr}` : `${obl.name_ar}${suffixAr} ${tag}`
    const name_en = usesColumn ? `${obl.name_en}${suffixEn}` : `${obl.name_en}${suffixEn} ${tag}`

    setSaving(true)

    const baseInsert = {
      user_id: user.id,
      name_ar,
      name_en,
      amount: num,
      status: 'paid' as const,
      date: dateStr,
    }

    const { data: inserted, error: outErr } = usesColumn
      ? await supabase.from('outflows').insert({ ...baseInsert, obligation_id: obl.id }).select('id').maybeSingle()
      : await supabase.from('outflows').insert(baseInsert).select('id').maybeSingle()

    if (outErr) {
      setError(outErr.message)
      setSaving(false)
      return
    }
    const newOutflowId = inserted?.id as string | undefined

    if (usesColumn) {
      const newPaid = obligationPaidAmount(obl, markerPaidSum) + num
      const { error: obErr } = await supabase.from('obligations').update({ paid_amount: newPaid }).eq('id', obl.id)
      if (obErr) {
        if (newOutflowId) await supabase.from('outflows').delete().eq('id', newOutflowId)
        setError(obErr.message)
        setSaving(false)
        return
      }
    } else {
      const currentPaid = obligationPaidAmount(obl, markerPaidSum)
      const newPaidTotal = currentPaid + num
      const newRem = Math.max(0, Number(obl.amount) - newPaidTotal)
      const legacyStatus = (obl as { status?: 'paid' | 'pending' | null }).status
      const obUpdate =
        newRem <= 0.0001
          ? { status: 'paid' as const }
          : legacyStatus === 'paid'
            ? { status: 'pending' as const }
            : undefined

      if (obUpdate) {
        const { error: obErr } = await supabase.from('obligations').update(obUpdate).eq('id', obl.id)
        if (obErr) {
          if (newOutflowId) await supabase.from('outflows').delete().eq('id', newOutflowId)
          setError(obErr.message)
          setSaving(false)
          return
        }
      }
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
        aria-labelledby="pay-obl-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="pay-obl-title" className="text-lg font-bold text-slate-900">
            {t('سداد التزام', 'Pay obligation')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors"
            aria-label={t('إغلاق', 'Close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-border bg-surface/50 px-5 py-3 text-sm">
          <p className="font-semibold text-slate-900">
            {locale === 'ar' ? obligation.name_ar : obligation.name_en}
          </p>
          <p className="mt-1 text-muted">
            {t('المتبقي:', 'Remaining:')}{' '}
            <span className="font-bold text-warning tabular-nums" dir="ltr">
              {formatMoney(remaining, locale)}
            </span>
          </p>
          {availableCash != null ? (
            <p className="mt-1 text-xs text-muted">
              {t('السيولة المتاحة في الفترة:', 'Available in period:')}{' '}
              <span className="font-semibold text-foreground tabular-nums" dir="ltr">
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
            <span className="mb-2 block text-sm font-medium text-slate-800">
              {t('نوع السداد', 'Payment type')}
            </span>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayMode('partial')
                  setPayAmount('')
                }}
                className={cn(
                  'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  payMode === 'partial'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border text-muted hover:bg-surface'
                )}
              >
                {t('سداد جزئي', 'Partial payment')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode('full')
                  setPayAmount(String(remaining))
                }}
                className={cn(
                  'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  payMode === 'full'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border text-muted hover:bg-surface'
                )}
              >
                {t('سداد كامل المتبقي', 'Pay full balance')}
              </button>
            </div>

            <label htmlFor="pay-amt" className="mb-1.5 block text-sm font-medium text-slate-800">
              {payMode === 'partial'
                ? t('المبلغ المراد سداده', 'Amount to pay')
                : t('مبلغ السداد', 'Payment amount')}
            </label>
            {payMode === 'partial' ? (
              <>
                <input
                  id="pay-amt"
                  type="text"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
                  dir="ltr"
                  placeholder={t('أقل أو يساوي المتبقي', 'Up to remaining balance')}
                />
                <p className="mt-1.5 text-xs text-muted">
                  {t('الحد الأقصى:', 'Max:')}{' '}
                  <span className="font-semibold tabular-nums" dir="ltr">
                    {formatMoney(remaining, locale)}
                  </span>
                </p>
              </>
            ) : (
              <input
                id="pay-amt"
                type="text"
                readOnly
                value={formatMoney(remaining, locale)}
                className="w-full cursor-default rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-foreground"
                dir="ltr"
              />
            )}
          </div>

          <div>
            <label htmlFor="pay-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ السداد', 'Payment date')}
            </label>
            <input
              id="pay-date"
              type="date"
              min={minD}
              max={maxD}
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
              disabled={saving || remaining <= 0}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-dark transition-colors disabled:opacity-60"
            >
              {saving ? t('جاري التسجيل…', 'Saving…') : t('تسجيل السداد', 'Record payment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
