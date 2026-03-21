'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Outflow } from '@/types/database'
import { dateToLocalISODate, defaultDateInPeriod } from '@/lib/date-local'
import { computeAvailableCash, computeAvailableCashExcludingOutflow } from '@/lib/cash-liquidity'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  edit: Outflow | null
  periodStart: Date
  periodEnd: Date
}

export function GeneralOutflowModal({ open, onClose, onSaved, edit, periodStart, periodEnd }: Props) {
  const { t, locale } = useLanguage()
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'paid' | 'pending'>('paid')
  const [dateStr, setDateStr] = useState(() => defaultDateInPeriod(periodStart, periodEnd))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  useEffect(() => {
    if (!open) return
    setError('')
    if (edit) {
      setNameAr(edit.name_ar)
      setNameEn(edit.name_en)
      setAmount(String(edit.amount))
      setStatus(edit.status)
      setDateStr(edit.date)
    } else {
      setNameAr('')
      setNameEn('')
      setAmount('')
      setStatus('paid')
      setDateStr(defaultDateInPeriod(periodStart, periodEnd))
    }
  }, [open, edit, periodStart, periodEnd])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ar = nameAr.trim()
    const en = nameEn.trim()
    if (!ar && !en) {
      setError(t('يرجى إدخال الاسم بالعربية أو الإنجليزية', 'Please enter a name in Arabic or English'))
      return
    }
    const num = parseFloat(amount.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('المبلغ يجب أن يكون أكبر من صفر', 'Amount must be greater than zero'))
      return
    }
    if (dateStr < minD || dateStr > maxD) {
      setError(
        t('التاريخ يجب أن يكون ضمن الفترة المالية الحالية', 'Date must be within the current financial period')
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

      if (status === 'paid') {
        const available = edit
          ? await computeAvailableCashExcludingOutflow(supabase, user.id, minD, maxD, edit.id)
          : await computeAvailableCash(supabase, user.id, minD, maxD)
        if (num > available + 0.0001) {
          setError(
            t(
              'لا توجد سيولة كافية في المحفظة لتسجيل هذا المصروف كمدفوع. يمكنك اختيار «معلق» أو زيادة الدخل.',
              'Insufficient wallet balance to record this as paid. Choose «Pending» or add income.'
            )
          )
          return
        }
      }

      /** لا نرسل obligation_id للمصروف العام — تجنب خطأ PostgREST إن لم يُنفَّذ بعد migration 002 */
      const row = {
        name_ar: ar || en,
        name_en: en || ar,
        amount: num,
        status,
        date: dateStr,
      }

      if (edit) {
        const { error: up } = await supabase.from('outflows').update(row).eq('id', edit.id)
        if (up) {
          setError(up.message)
          return
        }
      } else {
        const { error: ins } = await supabase.from('outflows').insert({ ...row, user_id: user.id })
        if (ins) {
          setError(ins.message)
          return
        }
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
        aria-labelledby="outflow-modal-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="outflow-modal-title" className="text-lg font-bold text-slate-900">
            {edit ? t('تعديل مصروف عام', 'Edit general expense') : t('مصروف عام', 'General expense')}
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

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted">
            {t(
              'المصروف «المدفوع» يُخصم فوراً من سيولة المحفظة. «معلق» لا يُخصم حتى تتوفر سيولة لاحقاً.',
              '«Paid» deducts from wallet liquidity immediately. «Pending» does not deduct until you mark it paid.'
            )}
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الحالة', 'Status')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus('paid')}
                className={cn(
                  'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  status === 'paid'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border text-muted hover:bg-surface'
                )}
              >
                {t('مدفوع', 'Paid')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('pending')}
                className={cn(
                  'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                  status === 'pending'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border text-muted hover:bg-surface'
                )}
              >
                {t('معلق', 'Pending')}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="out-name-ar" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الاسم (عربي) — اختياري', 'Name (Arabic) — optional')}
            </label>
            <input
              id="out-name-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="rtl"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="out-name-en" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الاسم (إنجليزي) — اختياري', 'Name (English) — optional')}
            </label>
            <input
              id="out-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="out-amount" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('المبلغ', 'Amount')}
            </label>
            <input
              id="out-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
              placeholder={locale === 'ar' ? '٠.٠٠' : '0.00'}
            />
          </div>

          <div>
            <label htmlFor="out-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('التاريخ', 'Date')}
            </label>
            <input
              id="out-date"
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
              disabled={saving}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:bg-brand-dark transition-colors disabled:opacity-60"
            >
              {saving ? t('جاري الحفظ…', 'Saving…') : t('حفظ', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
