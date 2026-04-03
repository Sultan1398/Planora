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
import { Pencil, Trash2, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRolloverBalance } from '@/hooks/useRolloverBalance'
import { useAvailableCash } from '@/hooks/useAvailableCash'
import { useAlert } from '@/contexts/AlertContext'
import { TrendUp, ListDashes, CaretUp, CaretDown } from '@phosphor-icons/react'

const inflowNav = getAppNavItem('/inflow')

export default function InflowPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()
  const [rows, setRows] = useState<Inflow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Inflow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isSourcesOpen, setIsSourcesOpen] = useState(true)
  const { showAlert } = useAlert()

  const {
    rolledOverBalance,
    loading: rolloverLoading,
    error: rolloverError,
  } = useRolloverBalance({
    periodKey,
    periodDates,
    startDay,
  })
  const { availableCash, loading: cashLoading } = useAvailableCash({ periodKey, periodDates, startDay })

  const loadInflows = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setLoading(true)
    setFetchError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isStillMounted()) return
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

    if (!isStillMounted()) return
    if (error) {
      setFetchError(error.message)
      setRows([])
    } else {
      setRows((data as Inflow[] | null) ?? [])
    }
    setLoading(false)
  }, [periodDates.start, periodDates.end])

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    void loadInflows(isStillMounted)
    return () => {
      isMounted = false
    }
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

  function handleDelete(id: string) {
    showAlert({
      type: 'confirm',
      title: t('تأكيد', 'Confirm'),
      message: t('حذف هذا المصدر؟', 'Delete this income source?'),
      onConfirm: () => {
        void (async () => {
          setDeletingId(id)
          const supabase = createClient()
          const { error } = await supabase.from('inflows').delete().eq('id', id)
          setDeletingId(null)
          if (error) {
            showAlert({
              type: 'alert',
              title: t('خطأ', 'Error'),
              message: error.message,
            })
            return
          }
          loadInflows()
        })()
      },
    })
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        nav={inflowNav}
        subtitle={t('مصادر الدخل للفترة الحالية', 'Income sources for current period')}
        actions={
          <>
            <PeriodNavigator />
          </>
        }
      />

      {fetchError || rolloverError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {[fetchError, rolloverError].filter(Boolean).join(' · ')}
        </div>
      ) : null}

      {!loading && !cashLoading && availableCash != null ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1B6EF3] bg-[#1B6EF3] px-4 py-3 shadow-sm">
          <span className="text-sm text-white">
            {t('السيولة المتاحة في الفترة', 'Available liquidity this period')}
          </span>
          <span className="text-lg font-bold text-white tabular-nums" dir="ltr">
            {formatMoney(availableCash, locale)}
          </span>
        </div>
      ) : null}

      {/* بطاقة إجمالي الدخل والتفاصيل */}
      <div className="mb-8 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02]">
        {/* الجزء العلوي: إجمالي الدخل والأزرار */}
        <div className="relative flex flex-col justify-between gap-4 bg-gradient-to-b from-blue-50/40 to-white p-5 md:flex-row md:items-center">
          <div className="pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full bg-blue-100/50 blur-2xl" />
          <div className="relative flex flex-col items-start">
            <div className="mb-2 flex items-center gap-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                <TrendUp weight="duotone" className="h-5 w-5 text-emerald-700" aria-hidden />
              </div>
              <h2 className="text-sm font-bold text-gray-500">
                {t('إجمالي الدخل للفترة الحالية', 'Total Income for Current Period')}
              </h2>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
              <span className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl" dir="ltr">
                {formatMoney(totals.total + rolledOverBalance, locale)}
              </span>
            </div>
          </div>

          <div className="relative mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center md:mt-0">
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center justify-center gap-x-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t('إضافة دخل', 'Add Income')}
            </button>
          </div>
        </div>

        {/* الجزء السفلي: تفاصيل الدخل — نصوص بلون زمردي يتوافق مع تمييز قسم الدخل في التنقل */}
        <div className="grid grid-cols-1 border-t border-gray-100 bg-white sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-emerald-700">
              {t('الرصيد المرحل من السابق', 'Carried Over Balance')}
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(rolledOverBalance, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-emerald-700">{t('دخل ثابت', 'Fixed Income')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(totals.fixed, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">{t('دخل متغير', 'Variable Income')}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700" dir="ltr">
              {formatMoney(totals.variable, locale)}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <button
            type="button"
            onClick={() => setIsSourcesOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
            aria-expanded={isSourcesOpen}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <ListDashes weight="duotone" className="h-6 w-6 text-[#2563EB]" aria-hidden />
            </div>
            <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
              {t('قائمة المصادر', 'Sources List')} ({totals.count})
            </h2>
            {isSourcesOpen ? (
              <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            ) : (
              <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#2563EB]/10 px-4 py-2 text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB]/20"
          >
            + {t('إضافة دخل', 'Add income')}
          </button>
        </div>

        {isSourcesOpen && (
          <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
            <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  <p className="text-sm">{t('جاري التحميل…', 'Loading…')}</p>
                </div>
              ) : rows.length === 0 ? (
                <div className="px-6 py-14 text-center text-muted">
                  <p className="mb-4">
                    {t('لا توجد مصادر دخل مسجلة لهذه الفترة.', 'No income sources recorded for this period.')}
                  </p>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                  >
                    {t('+ إضافة أول مصدر دخل', '+ Add your first income source')}
                  </button>
                </div>
              ) : (
                <div className="mt-4 w-full overflow-x-auto border-t border-gray-100 pt-4">
                  <table className="w-full min-w-[700px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
                        <th scope="col" className="px-4 py-4 text-center">
                          {t('نوع الدخل', 'Income Type')}
                        </th>
                        <th scope="col" className="px-4 py-4 text-start">
                          {t('الاسم', 'Name')}
                        </th>
                        <th scope="col" className="px-4 py-4 text-center">
                          {t('التاريخ', 'Date')}
                        </th>
                        <th scope="col" className="px-4 py-4 text-center">
                          {t('المبلغ', 'Amount')}
                        </th>
                        <th scope="col" className="px-4 py-4 text-center">
                          {t('الإجراءات', 'Actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const isFixed = row.type === 'fixed'
                        const name =
                          locale === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-gray-50 bg-white transition-colors hover:bg-gray-50/50"
                          >
                            <td className="whitespace-nowrap px-4 py-4 text-center">
                              <span
                                className={cn(
                                  'inline-flex rounded-md px-2.5 py-1 text-xs font-bold',
                                  isFixed ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                                )}
                              >
                                {isFixed ? t('ثابت', 'Fixed') : t('متغير', 'Variable')}
                              </span>
                            </td>

                            <td className="whitespace-nowrap px-4 py-4 text-start font-bold text-gray-900">
                              {name || t('بدون اسم', 'Unnamed')}
                            </td>

                            <td className="whitespace-nowrap px-4 py-4 text-center text-gray-500" dir="ltr">
                              {row.date ? formatGregorianDate(parseLocalISODate(row.date), locale) : '-'}
                            </td>

                            <td
                              className="whitespace-nowrap px-4 py-4 text-center font-bold text-emerald-600"
                              dir="ltr"
                            >
                              +{formatMoney(Number(row.amount), locale)}
                            </td>

                            <td className="whitespace-nowrap px-4 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-blue-600 transition-colors hover:bg-blue-50"
                                  title={t('تعديل', 'Edit')}
                                  aria-label={t('تعديل', 'Edit')}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(row.id)}
                                  disabled={deletingId === row.id}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                  title={t('حذف', 'Delete')}
                                  aria-label={t('حذف', 'Delete')}
                                >
                                  {deletingId === row.id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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
