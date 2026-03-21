'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Obligation } from '@/types/database'
import { dateToLocalISODate, defaultDateInPeriod } from '@/lib/date-local'
import { obligationPaidAmount } from '@/lib/obligation-helpers'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  edit: Obligation | null
  /** مجموع سدادات العلامة (مخطط بدون paid_amount) */
  markerPaidSum?: number
  periodStart: Date
  periodEnd: Date
}

export function ObligationFormModal({
  open,
  onClose,
  onSaved,
  edit,
  markerPaidSum = 0,
  periodStart,
  periodEnd,
}: Props) {
  const { t, locale } = useLanguage()
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
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
      setTotalAmount(String(edit.amount))
      setDueDate(edit.due_date)
      setDateStr(edit.date)
    } else {
      setNameAr('')
      setNameEn('')
      setTotalAmount('')
      setDueDate(dateToLocalISODate(periodStart))
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
    const num = parseFloat(totalAmount.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('مبلغ الالتزام يجب أن يكون أكبر من صفر', 'Obligation amount must be greater than zero'))
      return
    }
    if (dateStr < minD || dateStr > maxD) {
      setError(
        t('تاريخ التسجيل يجب أن يكون ضمن الفترة الحالية', 'Record date must be within the current period')
      )
      return
    }
    if (!dueDate) {
      setError(t('حدد تاريخ الاستحقاق', 'Please set the due date'))
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

      const row = {
        name_ar: ar || en,
        name_en: en || ar,
        amount: num,
        due_date: dueDate,
        date: dateStr,
      }

      if (edit) {
        const paid = obligationPaidAmount(edit, markerPaidSum)
        if (num < paid - 0.0001) {
          setError(
            t('إجمالي الالتزام لا يمكن أن يكون أقل من المسدَّد بالفعل', 'Total cannot be less than amount already paid')
          )
          return
        }
        const { error: up } = await supabase.from('obligations').update(row).eq('id', edit.id)
        if (up) {
          setError(up.message)
          return
        }
      } else {
        /** لا نرسل paid_amount — الافتراضي 0 بعد migration 002؛ المخطط 001 بدون هذا العمود */
        const { error: ins } = await supabase.from('obligations').insert({ ...row, user_id: user.id })
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
        aria-labelledby="obl-form-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="obl-form-title" className="text-lg font-bold text-slate-900">
            {edit
              ? t('تعديل التزام مالي', 'Edit financial obligation')
              : t('التزام مالي جديد', 'New financial obligation')}
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

          <p className="text-xs text-muted leading-relaxed">
            {t(
              'تسجيل الالتزام لا يخصم المحفظة؛ السداد يُسجَّل كمصروف ويحتاج سيولة.',
              'Recording an obligation does not deduct your wallet; paying it records an expense and requires available cash.'
            )}
          </p>

          <div>
            <label htmlFor="obl-name-ar" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الاسم (عربي) — اختياري', 'Name (Arabic) — optional')}
            </label>
            <input
              id="obl-name-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="rtl"
            />
          </div>
          <div>
            <label htmlFor="obl-name-en" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الاسم (إنجليزي) — اختياري', 'Name (English) — optional')}
            </label>
            <input
              id="obl-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="obl-total" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('إجمالي مبلغ الالتزام', 'Total obligation amount')}
            </label>
            <input
              id="obl-total"
              type="text"
              inputMode="decimal"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
              placeholder={locale === 'ar' ? '٠.٠٠' : '0.00'}
            />
          </div>

          <div>
            <label htmlFor="obl-due" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ استحقاق السداد', 'Payment due date')}
            </label>
            <input
              id="obl-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            />
          </div>

          <div>
            <label htmlFor="obl-reg-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ التسجيل', 'Record date')}
            </label>
            <input
              id="obl-reg-date"
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
