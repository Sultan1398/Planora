'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { formatGregorianDate } from '@/lib/period'
import type { Inflow } from '@/types/database'
import { InflowFormModal } from '@/components/inflow/InflowFormModal'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const inflowNav = getAppNavItem('/inflow')

export default function InflowPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates } = usePeriod()
  const [rows, setRows] = useState<Inflow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Inflow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadInflows = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setRows([])
      setLoading(false)
      return
    }
    const start = dateToLocalISODate(periodDates.start)
    const end = dateToLocalISODate(periodDates.end)
    const { data, error } = await supabase
      .from('inflows')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setFetchError(error.message)
      setRows([])
    } else {
      setRows((data as Inflow[] | null) ?? [])
    }
    setLoading(false)
  }, [periodDates.start, periodDates.end])

  useEffect(() => {
    loadInflows()
  }, [loadInflows, periodKey])

  const totals = useMemo(() => {
    let total = 0
    let fixed = 0
    let variable = 0
    for (const r of rows) {
      total += Number(r.amount)
      if (r.type === 'fixed') fixed += Number(r.amount)
      else variable += Number(r.amount)
    }
    return { total, fixed, variable, count: rows.length }
  }, [rows])

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(row: Inflow) {
    setEditing(row)
    setModalOpen(true)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('حذف هذا المصدر؟', 'Delete this income source?'))) return
    setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('inflows').delete().eq('id', id)
    setDeletingId(null)
    if (error) {
      alert(error.message)
      return
    }
    loadInflows()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        nav={inflowNav}
        subtitle={t('مصادر الدخل للفترة الحالية', 'Income sources for current period')}
        actions={
          <>
            <PeriodNavigator />
            <button
              type="button"
              onClick={openAdd}
              className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              {t('+ إضافة دخل', '+ Add Income')}
            </button>
          </>
        }
      />

      {/* ملخص الفترة */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-muted">{t('إجمالي الدخل', 'Total income')}</p>
          <p className="mt-1 text-2xl font-bold text-success tabular-nums">
            {loading ? '—' : formatMoney(totals.total, locale)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-muted">{t('دخل ثابت', 'Fixed')}</p>
          <p className="mt-1 text-lg font-semibold text-slate-800 tabular-nums">
            {loading ? '—' : formatMoney(totals.fixed, locale)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-muted">{t('دخل متغير', 'Variable')}</p>
          <p className="mt-1 text-lg font-semibold text-slate-800 tabular-nums">
            {loading ? '—' : formatMoney(totals.variable, locale)}
          </p>
        </div>
      </div>

      {fetchError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {fetchError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between bg-surface/50">
          <h2 className="text-sm font-semibold text-slate-800">
            {t('قائمة المصادر', 'Sources')} ({totals.count})
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm">{t('جاري التحميل…', 'Loading…')}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-muted mb-4">{t('لا توجد مصادر دخل لهذه الفترة', 'No income sources for this period')}</p>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
            >
              {t('إضافة أول مصدر دخل', 'Add your first income source')}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-surface/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {locale === 'ar' ? row.name_ar : row.name_en}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 font-medium',
                        row.type === 'fixed' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'
                      )}
                    >
                      {row.type === 'fixed' ? t('ثابت', 'Fixed') : t('متغير', 'Variable')}
                    </span>
                    <span dir="ltr" className="tabular-nums">
                      {formatGregorianDate(parseLocalISODate(row.date), locale)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:shrink-0">
                  <p className="text-lg font-bold text-success tabular-nums" dir="ltr">
                    {formatMoney(Number(row.amount), locale)}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="rounded-lg p-2 text-muted hover:bg-surface hover:text-brand transition-colors"
                      aria-label={t('تعديل', 'Edit')}
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      disabled={deletingId === row.id}
                      className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger transition-colors disabled:opacity-50"
                      aria-label={t('حذف', 'Delete')}
                    >
                      {deletingId === row.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <InflowFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSaved={loadInflows}
        edit={editing}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />
    </div>
  )
}
