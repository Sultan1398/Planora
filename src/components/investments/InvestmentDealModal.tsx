'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Investment } from '@/types/database'
import { computeInvestmentInternalBalance, getInvestmentDealOpenTx } from '@/lib/investment-ledger'
import { dateToLocalISODate } from '@/lib/date-local'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DealCategoryKey = 'stocks' | 'forex' | 'real_estate' | 'projects'

type DealCategory = {
  key: DealCategoryKey
  labelAr: string
  labelEn: string
  /** قيمة investments.type القديمة */
  dbType: Investment['type']
}

const DEAL_CATEGORIES: DealCategory[] = [
  { key: 'stocks', labelAr: 'أسهم', labelEn: 'Stocks', dbType: 'stocks' },
  { key: 'forex', labelAr: 'فوركس', labelEn: 'Forex', dbType: 'other' },
  { key: 'real_estate', labelAr: 'عقار', labelEn: 'Real Estate', dbType: 'partnership' },
  { key: 'projects', labelAr: 'مشاريع', labelEn: 'Projects', dbType: 'freelance' },
]

function categoryFromDbType(dbType: Investment['type']): DealCategory {
  return (
    DEAL_CATEGORIES.find((c) => c.dbType === dbType) ?? {
      key: 'projects',
      labelAr: 'مشاريع',
      labelEn: 'Projects',
      dbType: dbType ?? 'freelance',
    }
  )
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  mode: 'create' | 'edit'
  edit: Investment | null
  periodStart: Date
  periodEnd: Date
}

export function InvestmentDealModal({ open, onClose, onSaved, mode, edit, periodStart, periodEnd }: Props) {
  const { t, locale } = useLanguage()
  const [categoryKey, setCategoryKey] = useState<DealCategoryKey>('stocks')
  const [investmentName, setInvestmentName] = useState('')
  const [entryAmountStr, setEntryAmountStr] = useState('')
  const [entryDate, setEntryDate] = useState(() => dateToLocalISODate(periodStart))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const minD = dateToLocalISODate(periodStart)
  const maxD = dateToLocalISODate(periodEnd)

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)

    if (mode === 'edit' && edit) {
      const cat = categoryFromDbType(edit.type)
      setCategoryKey(cat.key)
      setInvestmentName(edit.name_ar ?? edit.name_en ?? '')
      setEntryAmountStr(String(edit.entry_amount))
      setEntryDate(edit.entry_date)
    } else {
      setCategoryKey('stocks')
      setInvestmentName('')
      setEntryAmountStr('')
      setEntryDate(minD)
    }
  }, [open, mode, edit, minD])

  const selectedCategory = useMemo(
    () => DEAL_CATEGORIES.find((c) => c.key === categoryKey) ?? DEAL_CATEGORIES[0],
    [categoryKey]
  )

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const num = parseFloat(entryAmountStr.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('أدخل قيمة إجمالي الصفقة', 'Enter a valid deal amount'))
      return
    }
    const nm = investmentName.trim()
    if (!nm) {
      setError(t('يرجى إدخال اسم الاستثمار', 'Please enter an investment name'))
      return
    }
    if (!entryDate) {
      setError(t('حدد تاريخ فتح الصفقة', 'Please set the deal open date'))
      return
    }
    if (entryDate < minD || entryDate > maxD) {
      setError(
        t('تاريخ فتح الصفقة يجب أن يكون ضمن الفترة المالية الحالية', 'Deal open date must be within the current period')
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
      const internalBal = await computeInvestmentInternalBalance(supabase, user.id)
      if (mode === 'create') {
        if (num > internalBal + 0.0001) {
          setError(t('لا توجد سيولة كافية داخل الاستثمارات لفتح هذه الصفقة', 'Insufficient internal investment funds to open this deal'))
          return
        }
      } else {
        if (!edit) return
        const oldEntry = Number(edit.entry_amount)
        const internalAfter = internalBal + oldEntry - num
        if (internalAfter < -0.0001) {
          setError(t('لا يمكن زيادة قيمة الصفقة بهذا الشكل لأن السيولة الداخلية غير كافية', 'Cannot increase deal amount: internal funds are insufficient'))
          return
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      return
    }

    setSaving(true)

    const name_ar = nm
    const name_en = nm

    if (mode === 'create') {
      const { data: inserted, error: insErr } = await supabase
        .from('investments')
        .insert({
          user_id: user.id,
          name_ar,
          name_en,
          type: selectedCategory.dbType,
          entry_amount: num,
          entry_date: entryDate,
          status: 'open',
        })
        .select('id')
        .single()

      if (insErr || !inserted?.id) {
        setError(insErr?.message ?? t('فشل فتح الصفقة', 'Failed to open deal'))
        setSaving(false)
        return
      }

      const { error: txErr } = await (supabase as any).from('investment_wallet_transactions').insert({
        user_id: user.id,
        type: 'deal_open',
        amount: num,
        date: entryDate,
        investment_id: inserted.id,
      })

      if (txErr) {
        // تراجع منطقي: لا نملك trigger لعمليات معاملة؛ نحاول الحذف إن لزم
        await supabase.from('investments').delete().eq('id', inserted.id)
        setError(txErr.message)
        setSaving(false)
        return
      }
    } else {
      if (!edit) return

      const openTx = await getInvestmentDealOpenTx(supabase, user.id, edit.id)
      if (!openTx?.id) {
        setError(t('لم يتم العثور على سجل فتح الصفقة الداخلي', 'Missing internal open transaction'))
        setSaving(false)
        return
      }

      const { error: updInvErr } = await supabase.from('investments').update({
        name_ar,
        name_en,
        type: selectedCategory.dbType,
        entry_amount: num,
        entry_date: entryDate,
        status: 'open',
      }).eq('id', edit.id)

      if (updInvErr) {
        setError(updInvErr.message)
        setSaving(false)
        return
      }

      const { error: updTxErr } = await (supabase as any)
        .from('investment_wallet_transactions')
        .update({ amount: num, date: entryDate })
        .eq('id', openTx.id)

      if (updTxErr) {
        setError(updTxErr.message)
        setSaving(false)
        return
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
        aria-labelledby="deal-modal-title"
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border bg-white shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="deal-modal-title" className="text-lg font-bold text-slate-900">
            {mode === 'edit' ? t('تعديل صفقة', 'Edit deal') : t('فتح صفقة جديدة', 'Open new deal')}
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
            <label htmlFor="deal-investment-name" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('اسم الاستثمار', 'Investment name')}
            </label>
            <input
              id="deal-investment-name"
              type="text"
              value={investmentName}
              onChange={(e) => setInvestmentName(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              placeholder={t('مثال: مايكروسوفت / بيتكوين / فيلا / مشروع تجاري', 'Example: Microsoft / Bitcoin / Villa / Commercial project')}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            />
          </div>

          <div>
            <label htmlFor="deal-path" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('مسار الاستثمار', 'Investment path')}
            </label>
            <select
              id="deal-path"
              value={categoryKey}
              onChange={(e) => setCategoryKey(e.target.value as DealCategoryKey)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
            >
              {DEAL_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {locale === 'ar' ? c.labelAr : c.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="deal-amount" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('إجمالي الصفقة', 'Total deal amount')}
            </label>
            <input
              id="deal-amount"
              type="text"
              inputMode="decimal"
              value={entryAmountStr}
              onChange={(e) => setEntryAmountStr(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-brand/20 focus:border-brand focus:ring-2"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="deal-date" className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ فتح الصفقة', 'Deal open date')}
            </label>
            <input
              id="deal-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
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

