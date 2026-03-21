'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/contexts/LanguageContext'
import { dateToLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { X, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InvestmentWalletTransaction } from '@/types/database'

type WalletTxRow = Pick<
  InvestmentWalletTransaction,
  'id' | 'type' | 'amount' | 'date' | 'investment_id' | 'created_at'
>

type Props = {
  open: boolean
  onClose: () => void
  periodStart: Date
  periodEnd: Date
}

export function InvestmentActivityLogModal({ open, onClose, periodStart, periodEnd }: Props) {
  const { t, locale } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [rows, setRows] = useState<WalletTxRow[]>([])
  const [dealNames, setDealNames] = useState<Record<string, { name_ar: string; name_en: string }>>({})

  const minD = useMemo(() => dateToLocalISODate(periodStart), [periodStart])
  const maxD = useMemo(() => dateToLocalISODate(periodEnd), [periodEnd])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setRows([])
      setDealNames({})
      setLoading(false)
      return
    }

    const txRes = await supabase
      .from('investment_wallet_transactions')
      .select('id, type, amount, date, investment_id, created_at')
      .eq('user_id', user.id)
      .gte('date', minD)
      .lte('date', maxD)
      .order('created_at', { ascending: false })

    if (txRes.error) {
      setLoadError(txRes.error.message)
      setRows([])
      setDealNames({})
      setLoading(false)
      return
    }

    const list = (txRes.data ?? []) as WalletTxRow[]
    setRows(list)

    const ids = [...new Set(list.map((r) => r.investment_id).filter(Boolean))] as string[]
    if (ids.length === 0) {
      setDealNames({})
      setLoading(false)
      return
    }

    const invRes = await supabase.from('investments').select('id, name_ar, name_en').in('id', ids)
    if (invRes.error) {
      setDealNames({})
      setLoading(false)
      return
    }

    const map: Record<string, { name_ar: string; name_en: string }> = {}
    for (const inv of (invRes.data ?? []) as { id: string; name_ar: string; name_en: string }[]) {
      map[inv.id] = { name_ar: inv.name_ar, name_en: inv.name_en }
    }
    setDealNames(map)
    setLoading(false)
  }, [minD, maxD])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  function typeLabel(type: InvestmentWalletTransaction['type']): string {
    switch (type) {
      case 'deposit':
        return t('إيداع للاستثمارات', 'Deposit to investments')
      case 'withdrawal':
        return t('سحب للمحفظة', 'Withdraw to wallet')
      case 'deal_open':
        return t('فتح صفقة', 'Deal opened')
      case 'deal_close':
        return t('إغلاق صفقة', 'Deal closed')
      default:
        return type
    }
  }

  function typeBadgeClass(type: InvestmentWalletTransaction['type']): string {
    switch (type) {
      case 'deposit':
        return 'bg-blue-50 text-blue-700 border-blue-100'
      case 'withdrawal':
        return 'bg-slate-50 text-slate-700 border-border'
      case 'deal_open':
        return 'bg-orange-50 text-orange-700 border-orange-100'
      case 'deal_close':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100'
      default:
        return 'bg-surface text-slate-700 border-border'
    }
  }

  if (!open) return null

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
        aria-labelledby="inv-log-title"
        className={cn('relative w-full max-w-lg rounded-2xl border border-border bg-white shadow-xl', 'max-h-[90vh] overflow-hidden flex flex-col')}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ScrollText className="h-5 w-5 shrink-0 text-brand" />
            <h2 id="inv-log-title" className="text-lg font-bold text-slate-900 truncate">
              {t('سجل عمليات الاستثمار', 'Investment activity log')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:bg-surface transition-colors shrink-0"
            aria-label={t('إغلاق', 'Close')}
          >
            <X size={20} />
          </button>
        </div>

        <p className="border-b border-border bg-surface/50 px-5 py-2 text-xs text-muted" dir="ltr">
          {minD} — {maxD}
        </p>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loadError ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {loadError}
            </p>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {t('لا توجد عمليات في هذه الفترة', 'No activity in this period')}
            </p>
          ) : (
            <ul className="space-y-0 divide-y divide-border">
              {rows.map((r) => {
                const deal = r.investment_id ? dealNames[r.investment_id] : null
                const dealName = deal ? (locale === 'ar' ? deal.name_ar : deal.name_en) : null
                return (
                  <li key={r.id} className="py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded-lg border px-2 py-0.5 text-xs font-semibold',
                          typeBadgeClass(r.type)
                        )}
                      >
                        {typeLabel(r.type)}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-900 shrink-0" dir="ltr">
                        {formatMoney(Number(r.amount), locale)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="tabular-nums" dir="ltr">
                        {r.date}
                      </span>
                      {dealName ? <span className="font-medium text-slate-600 truncate max-w-[60%]">{dealName}</span> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
