'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import type { FixedAsset } from '@/types/database'
import { dateToLocalISODate } from '@/lib/date-local'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ASSET_TYPE_VALUES = ['real_estate', 'precious_metals', 'unlisted_companies', 'other'] as const
type AssetTypeValue = (typeof ASSET_TYPE_VALUES)[number]

function assetTypeLabel(t: (ar: string, en: string) => string, v: AssetTypeValue): string {
  switch (v) {
    case 'real_estate':
      return t('عقار', 'Real estate')
    case 'precious_metals':
      return t('معادن ثمينة', 'Precious metals')
    case 'unlisted_companies':
      return t('شركات غير مدرجة', 'Unlisted companies')
    default:
      return t('أخرى', 'Other')
  }
}

/** For list rows: localized label, or raw DB value if unknown */
export function displayAssetType(t: (ar: string, en: string) => string, assetType: string): string {
  if (ASSET_TYPE_VALUES.includes(assetType as AssetTypeValue)) {
    return assetTypeLabel(t, assetType as AssetTypeValue)
  }
  return assetType
}

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  edit: FixedAsset | null
}

export function FixedAssetModal({ open, onClose, onSaved, edit }: Props) {
  const { t } = useLanguage()
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [assetType, setAssetType] = useState<AssetTypeValue>('real_estate')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (edit) {
      setNameAr(edit.name_ar)
      setNameEn(edit.name_en)
      const known = ASSET_TYPE_VALUES.includes(edit.asset_type as AssetTypeValue)
      setAssetType(known ? (edit.asset_type as AssetTypeValue) : 'other')
      setEstimatedValue(String(edit.estimated_value))
      setPurchaseDate(edit.purchase_date?.slice(0, 10) ?? dateToLocalISODate(new Date()))
    } else {
      setNameAr('')
      setNameEn('')
      setAssetType('real_estate')
      setEstimatedValue('')
      setPurchaseDate(dateToLocalISODate(new Date()))
    }
  }, [open, edit])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ar = nameAr.trim()
    const en = nameEn.trim()
    if (!ar && !en) {
      setError(t('يرجى إدخال اسم الأصل', 'Please enter an asset name'))
      return
    }
    const num = parseFloat(estimatedValue.replace(/,/g, ''))
    if (Number.isNaN(num) || num <= 0) {
      setError(t('القيمة التقديرية غير صالحة', 'Invalid estimated value'))
      return
    }
    if (!purchaseDate) {
      setError(t('حدد تاريخ الشراء', 'Please set purchase date'))
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: walletData, error: walletError } = await (supabase as any).from('growth_wallets').select('balance').single()
      const walletBalance = !walletError && walletData ? Number(walletData.balance) || 0 : 0

      const row = {
        name_ar: ar || en,
        name_en: en || ar,
        asset_type: assetType,
        estimated_value: num,
        purchase_date: purchaseDate,
      }

      if (edit) {
        const previousValue = Number(edit.estimated_value || 0)
        const delta = num - previousValue
        if (delta > 0 && delta > walletBalance + 0.0001) {
          setError(
            t(
              'رصيد محفظة النمو غير كافٍ لزيادة قيمة الأصل',
              'Growth Wallet balance is insufficient for increasing this asset value'
            )
          )
          return
        }
        if (delta > 0) {
          // withdraw extra from wallet before update
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
            user_id: user.id,
            amount: delta,
            transaction_type: 'withdrawal',
          })
          if (walletTxErr) {
            setError(walletTxErr.message)
            return
          }
        }
        const { error: up } = await supabase.from('fixed_assets').update(row).eq('id', edit.id)
        if (up) {
          if (num > previousValue) {
            // compensate wallet if update fails
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('growth_wallet_transactions').insert({
              user_id: user.id,
              amount: num - previousValue,
              transaction_type: 'deposit',
            })
          }
          setError(up.message)
          return
        }
        if (delta < 0) {
          // release diff back to wallet
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
            user_id: user.id,
            amount: Math.abs(delta),
            transaction_type: 'deposit',
          })
          if (walletTxErr) {
            setError(walletTxErr.message)
            return
          }
        }
      } else {
        if (num > walletBalance + 0.0001) {
          setError(
            t(
              'رصيد محفظة النمو غير كافٍ لإضافة هذا الأصل',
              'Growth Wallet balance is insufficient for adding this asset'
            )
          )
          return
        }
        // withdraw from wallet first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: walletTxErr } = await (supabase as any).from('growth_wallet_transactions').insert({
          user_id: user.id,
          amount: num,
          transaction_type: 'withdrawal',
        })
        if (walletTxErr) {
          setError(walletTxErr.message)
          return
        }
        const { error: ins } = await supabase.from('fixed_assets').insert({
          ...row,
          user_id: user.id,
        })
        if (ins) {
          // compensate wallet if insert fails
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('growth_wallet_transactions').insert({
            user_id: user.id,
            amount: num,
            transaction_type: 'deposit',
          })
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
        aria-labelledby="fa-modal-title"
        className={cn(
          'relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-white shadow-xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="fa-modal-title" className="text-lg font-bold text-slate-900">
            {edit ? t('تعديل أصل', 'Edit asset') : t('أصل جديد', 'New asset')}
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
              {t('اسم الأصل (عربي)', 'Asset name (Arabic)')}
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
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('نوع الأصل', 'Asset type')}
            </label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetTypeValue)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
            >
              {ASSET_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {assetTypeLabel(t, v)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('القيمة التقديرية', 'Estimated value')}
            </label>
            <input
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-[#2563EB]/20 focus:border-[#2563EB] focus:ring-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              {t('تاريخ الشراء', 'Purchase date')}
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
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
