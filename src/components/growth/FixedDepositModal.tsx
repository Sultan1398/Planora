'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { FixedDeposit } from '@/types/database'
import { dateToLocalISODate } from '@/lib/date-local'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  edit: FixedDeposit | null
}

export function FixedDepositModal({ open, onClose, onSaved, edit }: Props) {
  const { t } = useLanguage()
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [amount, setAmount] = useState('')
  const [roi, setRoi] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (edit) {
      setNameAr(edit.name_ar)
      setNameEn(edit.name_en)
      setAmount(String(edit.amount))
      setRoi(String(edit.roi_percentage))
      setStartDate(edit.start_date?.slice(0, 10) ?? dateToLocalISODate(new Date()))
      setDueDate(edit.due_date.slice(0, 10))
    } else {
      setNameAr('')
      setNameEn('')
      setAmount('')
      setRoi('')
      const today = dateToLocalISODate(new Date())
      setStartDate(today)
      setDueDate(today)
    }
  }, [open, edit])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ar = nameAr.trim()
    const en = nameEn.trim()
    if (!ar && !en) {
      setError(t('يرجى إدخال اسم الوديعة', 'Please enter a deposit name'))
      return
    }
    const num = parseFloat(amount.replace(/,/g, ''))
    if (Number.isNaN(num) || num < 0) {
      setError(t('المبلغ غير صالح', 'Invalid amount'))
      return
    }
    const roiNum = parseFloat(roi.replace(/,/g, ''))
    if (Number.isNaN(roiNum) || roiNum < 0) {
      setError(t('نسبة العائد غير صالحة', 'Invalid ROI'))
      return
    }
    if (!startDate || !dueDate) {
      setError(t('حدد تاريخي البدء والاستحقاق', 'Set start and due dates'))
      return
    }
    if (dueDate < startDate) {
      setError(t('تاريخ الاستحقاق يجب أن يكون بعد تاريخ البدء', 'Due date must be on or after start date'))
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
        roi_percentage: roiNum,
        start_date: startDate,
        due_date: dueDate,
      }

      if (edit) {
        const { error: up } = await supabase.from('fixed_deposits').update(row).eq('id', edit.id)
        if (up) {
          setError(up.message)
          return
        }
      } else {
        const { error: ins } = await supabase.from('fixed_deposits').insert({
          ...row,
          user_id: user.id,
          status: 'active' as const,
        })
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label={t('إغلاق', 'Close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-modal-title"
        className={cn(
          'relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-white shadow-xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="fd-modal-title" className="text-lg font-bold text-slate-900">
            {edit ? t('تعديل وديعة', 'Edit deposit') : t('وديعة جديدة', 'New deposit')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface"
            aria-label={t('إغلاق', 'Close')}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-[#EF4444]" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('اسم الوديعة / الصك (عربي)', 'Deposit name (Arabic)')}
            </label>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('الاسم (إنجليزي)', 'Name (English)')}
            </label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">{t('المبلغ', 'Amount')}</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('نسبة العائد السنوي %', 'Annual ROI %')}
            </label>
            <input
              value={roi}
              onChange={(e) => setRoi(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ البدء', 'Start date')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ الاستحقاق', 'Due date')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={startDate || undefined}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-surface"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#2563EB] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              {saving ? t('جاري الحفظ…', 'Saving…') : t('حفظ', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
