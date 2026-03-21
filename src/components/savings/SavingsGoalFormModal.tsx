'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { SavingsGoal } from '@/types/database'
import { dateToLocalISODate } from '@/lib/date-local'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  edit: SavingsGoal | null
}

export function SavingsGoalFormModal({ open, onClose, onSaved, edit }: Props) {
  const { t } = useLanguage()
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (edit) {
      setNameAr(edit.name_ar)
      setNameEn(edit.name_en)
      setTargetAmount(String(edit.target_amount))
      setStartDate(edit.start_date ?? edit.created_at.slice(0, 10))
      setTargetDate(edit.target_date ?? '')
    } else {
      setNameAr('')
      setNameEn('')
      setTargetAmount('')
      const today = dateToLocalISODate(new Date())
      setStartDate(today)
      setTargetDate('')
    }
  }, [open, edit])

  if (!open) return null

  function isMissingStartDateColumn(message: string): boolean {
    const m = message.toLowerCase()
    return m.includes("could not find the 'start_date' column") || m.includes('start_date')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ar = nameAr.trim()
    const en = nameEn.trim()
    if (!ar && !en) {
      setError(t('يرجى إدخال الاسم بالعربية أو الإنجليزية', 'Please enter a name in Arabic or English'))
      return
    }
    const num = parseFloat(targetAmount.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('المبلغ المستهدف يجب أن يكون أكبر من صفر', 'Target amount must be greater than zero'))
      return
    }
    if (!startDate) {
      setError(t('حدد تاريخ بداية الهدف', 'Please set the goal start date'))
      return
    }
    if (!targetDate) {
      setError(t('حدد تاريخ إغلاق / استهداف الهدف', 'Please set the goal closing / target date'))
      return
    }
    if (targetDate < startDate) {
      setError(
        t('تاريخ الإغلاق يجب أن يكون بعد تاريخ البداية', 'Closing date must be on or after the start date')
      )
      return
    }

    if (edit && num < Number(edit.current_amount) - 0.0001) {
      setError(
        t(
          'المستهدف لا يمكن أن يكون أقل من الرصيد الحالي. اسحب الفرق إلى المحفظة أولاً أو عدّل من صفحة السحب.',
          'Target cannot be less than current balance. Withdraw the excess to the wallet first.'
        )
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

      const row = {
        name_ar: ar || en,
        name_en: en || ar,
        target_amount: num,
        start_date: startDate,
        target_date: targetDate,
      }

      if (edit) {
        let { error: up } = await supabase.from('savings_goals').update(row).eq('id', edit.id)
        if (up && isMissingStartDateColumn(up.message)) {
          // توافق مع مخطط أقدم قبل migration 003
          ;({ error: up } = await supabase
            .from('savings_goals')
            .update({
              name_ar: ar || en,
              name_en: en || ar,
              target_amount: num,
              target_date: targetDate,
            })
            .eq('id', edit.id))
        }
        if (up) {
          setError(up.message)
          return
        }
      } else {
        let { error: ins } = await supabase
          .from('savings_goals')
          .insert({ ...row, user_id: user.id, current_amount: 0 })
        if (ins && isMissingStartDateColumn(ins.message)) {
          // توافق مع مخطط أقدم قبل migration 003
          ;({ error: ins } = await supabase.from('savings_goals').insert({
            name_ar: ar || en,
            name_en: en || ar,
            target_amount: num,
            target_date: targetDate,
            user_id: user.id,
            current_amount: 0,
          }))
        }
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
        aria-labelledby="sg-modal-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="sg-modal-title" className="text-lg font-bold text-slate-900">
            {edit ? t('تعديل هدف ادخار', 'Edit savings goal') : t('هدف ادخار جديد', 'New savings goal')}
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

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">{t('الاسم (عربي)', 'Name (Arabic)')}</label>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">{t('الاسم (إنجليزي)', 'Name (English)')}</label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('المبلغ المستهدف', 'Target amount')}
            </label>
            <input
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
            {edit ? (
              <p className="mt-1 text-xs text-muted">
                {t('الرصيد الحالي:', 'Current balance:')}{' '}
                <span className="font-semibold tabular-nums" dir="ltr">
                  {Number(edit.current_amount).toLocaleString()}
                </span>
              </p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ بداية الهدف', 'Goal start date')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ إغلاق / استهداف الهدف', 'Closing / target date')}
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={startDate || undefined}
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
