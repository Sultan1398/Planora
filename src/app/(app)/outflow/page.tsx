'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { PeriodNavigator } from '@/components/layout/PeriodNavigator'
import { PageHeader } from '@/components/layout/PageHeader'
import { getAppNavItem } from '@/config/navigation'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { formatMoney } from '@/lib/format-money'
import { formatGregorianDate } from '@/lib/period'
import {
  obligationPaidAmount,
  outflowIsObligationLinkedExpense,
  sumLegacyMarkerPayments,
} from '@/lib/obligation-helpers'
import type { Outflow, Obligation } from '@/types/database'
import { usePeriodObligations } from '@/hooks/usePeriodObligations'
import { useAvailableCash } from '@/hooks/useAvailableCash'
import { GeneralOutflowModal } from '@/components/outflow/GeneralOutflowModal'
import { ObligationFormModal } from '@/components/outflow/ObligationFormModal'
import { ObligationPayModal } from '@/components/outflow/ObligationPayModal'
import {
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  ReceiptText,
  CheckCircle,
  AlertCircle,
  TrendingDown,
} from 'lucide-react'
import { Plus, CaretUp, CaretDown, Receipt, CalendarCheck } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const outflowNav = getAppNavItem('/outflow')

export default function OutflowPage() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates, startDay } = usePeriod()
  const [isGeneralExpensesOpen, setIsGeneralExpensesOpen] = useState(true)
  const [isObligationsOpen, setIsObligationsOpen] = useState(true)
  const [outflows, setOutflows] = useState<Outflow[]>([])
  const [generalLoading, setGeneralLoading] = useState(true)
  const [generalError, setGeneralError] = useState('')

  const [generalModal, setGeneralModal] = useState(false)
  const [editingOutflow, setEditingOutflow] = useState<Outflow | null>(null)
  const [obligationFormOpen, setObligationFormOpen] = useState(false)
  const [editingObligation, setEditingObligation] = useState<Obligation | null>(null)
  const [payObligation, setPayObligation] = useState<Obligation | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const start = dateToLocalISODate(periodDates.start)
  const end = dateToLocalISODate(periodDates.end)

  const {
    summary: { totalRemaining },
    visibleObligations,
    obligationPeriodMetricsById,
    paymentRows: obligationPaymentOutflows,
    loading: obligationsLoading,
    error: obligationsError,
    reload: reloadObligations,
  } = usePeriodObligations({
    periodStart: start,
    periodEnd: end,
  })

  const {
    availableCash,
    loading: cashLoading,
    error: cashError,
    reload: reloadCash,
  } = useAvailableCash({ periodKey, periodDates, startDay })

  const reloadGeneral = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setGeneralLoading(true)
    setGeneralError('')
    setOutflows([])
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isStillMounted()) return
    if (!user) {
      setGeneralLoading(false)
      return
    }

    const [outRes] = await Promise.all([
      supabase
        .from('outflows')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (!isStillMounted()) return

    if (outRes.error) {
      setGeneralError(outRes.error.message)
      setOutflows([])
    } else {
      const raw = (outRes.data as Outflow[] | null) ?? []
      setOutflows(raw.filter((r) => !outflowIsObligationLinkedExpense(r as Outflow)))
    }

    if (!isStillMounted()) return
    setGeneralLoading(false)
  }, [start, end])

  const reloadAll = useCallback(() => {
    void reloadGeneral()
    void reloadObligations()
    void reloadCash()
  }, [reloadGeneral, reloadObligations, reloadCash])

  const loading = generalLoading || obligationsLoading || cashLoading
  const error = [generalError, obligationsError, cashError].filter(Boolean).join(' · ')
  const totalGeneralExpenses = outflows.reduce((acc, exp) => acc + Number(exp.amount || 0), 0)
  const totalObligations = visibleObligations.reduce((acc, ob) => acc + Number(ob.amount || 0), 0)
  const totalPaidObligations = visibleObligations.reduce(
    (acc, ob) => acc + Number(obligationPeriodMetricsById.get(ob.id)?.periodPaid || 0),
    0
  )
  const totalPeriodExpenses = totalGeneralExpenses + totalPaidObligations

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    // تأجيل الجلب عن جسم الـ effect لتفادي setState متزامن (قواعد React Compiler / ESLint)
    queueMicrotask(() => {
      if (!isMounted) return
      void reloadGeneral(isStillMounted)
    })
    return () => {
      isMounted = false
    }
  }, [reloadGeneral, periodKey])

  function openAddGeneral() {
    setEditingOutflow(null)
    setGeneralModal(true)
  }

  function openEditGeneral(row: Outflow) {
    setEditingOutflow(row)
    setGeneralModal(true)
  }

  async function deleteGeneral(id: string) {
    if (!confirm(t('حذف هذا المصروف؟', 'Delete this expense?'))) return
    setDeletingId(id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('outflows').delete().eq('id', id)
    setDeletingId(null)
    if (delErr) {
      alert(delErr.message)
      return
    }
    reloadAll()
  }

  function openAddObligation() {
    setEditingObligation(null)
    setObligationFormOpen(true)
  }

  function openEditObligation(row: Obligation) {
    setEditingObligation(row)
    setObligationFormOpen(true)
  }

  async function deleteObligation(row: Obligation) {
    const markerPaid = sumLegacyMarkerPayments(obligationPaymentOutflows, row.id)
    if (obligationPaidAmount(row, markerPaid) > 0.0001) {
      alert(
        t('لا يمكن حذف التزام تم سداد جزء منه', 'Cannot delete an obligation that has payments recorded')
      )
      return
    }
    if (!confirm(t('حذف هذا الالتزام؟', 'Delete this obligation?'))) return
    setDeletingId(row.id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('obligations').delete().eq('id', row.id)
    setDeletingId(null)
    if (delErr) {
      alert(delErr.message)
      return
    }
    reloadAll()
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        nav={outflowNav}
        subtitle={t('المصروفات العامة والتزامات مالية', 'General expenses and financial obligations')}
        actions={<PeriodNavigator />}
      />

      {!loading && availableCash != null ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1B6EF3] bg-[#1B6EF3] px-4 py-3 shadow-sm">
          <span className="text-sm text-white">{t('السيولة المتاحة في الفترة', 'Available liquidity this period')}</span>
          <span className="text-lg font-bold text-white tabular-nums" dir="ltr">
            {formatMoney(availableCash, locale)}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {/* بطاقة إجمالي المصروفات للفترة الحالية */}
      <div className="mb-8 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02]">
        <div className="relative flex flex-col justify-between gap-4 bg-gradient-to-b from-blue-50/40 to-white p-5 md:flex-row md:items-center">
          <div className="pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full bg-blue-100/50 blur-2xl" />
          <div className="relative flex flex-col items-start">
            <div className="mb-2 flex items-center gap-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-100">
                <TrendingDown className="h-5 w-5 text-rose-700" aria-hidden />
              </div>
              <h2 className="text-sm font-bold text-gray-500">
                {t('إجمالي المصروفات للفترة الحالية', 'Total Expenses for Current Period')}
              </h2>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
              <span className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl" dir="ltr">
                {formatMoney(totalPeriodExpenses, locale)}
              </span>
            </div>
          </div>

          <div className="relative mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center md:mt-0">
            <button
              type="button"
              onClick={openAddObligation}
              className="flex items-center justify-center gap-x-2 rounded-xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <Plus weight="bold" className="h-4 w-4" aria-hidden />
              {t('التزام مالي جديد', 'New Obligation')}
            </button>
            <button
              type="button"
              onClick={openAddGeneral}
              className="flex items-center justify-center gap-x-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1D4ED8]"
            >
              <Plus weight="bold" className="h-5 w-5" aria-hidden />
              {t('إضافة مصروف', 'Add Expense')}
            </button>
          </div>
        </div>

        {/* القسم السفلي: نصوص بلون وردي يتوافق مع تمييز قسم المصروف في التنقل (TrendingDown / rose) */}
        <div className="grid grid-cols-1 border-t border-gray-100 bg-white sm:grid-cols-3">
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-rose-700">{t('إجمالي المصروفات العامة', 'Total General Expenses')}</p>
            <p className="mt-2 text-2xl font-bold text-rose-700" dir="ltr">
              {formatMoney(totalGeneralExpenses, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center border-b border-gray-100 p-4 text-center sm:border-b-0">
            <p className="text-sm font-medium text-rose-700">
              {t('إجمالي الالتزامات المالية', 'Total Financial Obligations')}
            </p>
            <p className="mt-2 text-2xl font-bold text-rose-700" dir="ltr">
              {formatMoney(totalObligations, locale)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <p className="text-sm font-medium text-rose-700">{t('الالتزامات المسددة', 'Paid Obligations')}</p>
            <p className="mt-2 text-2xl font-bold text-rose-700" dir="ltr">
              {formatMoney(totalPaidObligations, locale)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsGeneralExpensesOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
              aria-expanded={isGeneralExpensesOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Receipt weight="duotone" className="h-6 w-6 text-[#2563EB]" aria-hidden />
              </div>
              <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
                {t('المصروفات العامة', 'General Expenses')}
              </h2>
              {isGeneralExpensesOpen ? (
                <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              ) : (
                <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
          </div>

          {isGeneralExpensesOpen && (
            <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
              <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted">
                    <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  </div>
                ) : outflows.length === 0 ? (
                  <div className="px-6 py-14 text-center text-muted">
                    <p className="mb-4">{t('لا توجد مصروفات عامة لهذه الفترة', 'No general expenses this period')}</p>
                    <button
                      type="button"
                      onClick={openAddGeneral}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                    >
                      {t('إضافة مصروف', 'Add expense')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 w-full overflow-x-auto border-t border-gray-100 pt-4">
                    <table className="w-full min-w-[700px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('الحالة', 'Status')}
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
                        {outflows.map((row) => {
                          const isPaid = row.status === 'paid'
                          const name = locale === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar
                          return (
                            <tr
                              key={row.id}
                              className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                            >
                              <td className="whitespace-nowrap px-4 py-4 text-center">
                                <span
                                  className={cn(
                                    'inline-flex rounded-md px-2.5 py-1 text-xs font-bold',
                                    isPaid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
                                  )}
                                >
                                  {isPaid ? t('مدفوع', 'Paid') : t('معلق', 'Pending')}
                                </span>
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-start font-bold text-gray-900">
                                {name || t('بدون اسم', 'Unnamed')}
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-center text-gray-500" dir="ltr">
                                {row.date ? formatGregorianDate(parseLocalISODate(row.date), locale) : '-'}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center font-bold text-rose-600"
                                dir="ltr"
                              >
                                {formatMoney(Number(row.amount), locale)}
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditGeneral(row)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-blue-600 transition-colors hover:bg-blue-50"
                                    title={t('تعديل', 'Edit')}
                                    aria-label={t('تعديل', 'Edit')}
                                  >
                                    <Pencil size={16} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteGeneral(row.id)}
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

        <section className="rounded-3xl border border-gray-200 bg-white p-2 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setIsObligationsOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-start transition-opacity hover:opacity-80"
              aria-expanded={isObligationsOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <CalendarCheck weight="duotone" className="h-6 w-6 text-[#2563EB]" aria-hidden />
              </div>
              <h2 className="min-w-0 text-lg font-bold text-[#1F2937]">
                {t('التزامات مالية', 'Financial obligations')}
              </h2>
              {isObligationsOpen ? (
                <CaretUp weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              ) : (
                <CaretDown weight="regular" className="ms-auto h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              )}
            </button>
          </div>

          {isObligationsOpen && (
            <div className="mt-2 border-t border-gray-100 p-2 sm:p-4">
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 via-slate-50/50 to-slate-100/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-6">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted">
                    <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  </div>
                ) : visibleObligations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-white/80 px-6 py-14 text-center text-muted">
                    <p className="mb-4">{t('لا توجد التزامات مسجّلة', 'No obligations recorded')}</p>
                    <button
                      type="button"
                      onClick={openAddObligation}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                    >
                      {t('إضافة التزام', 'Add obligation')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 w-full overflow-x-auto border-t border-gray-100 pt-4">
                    <table className="w-full min-w-[950px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
                          <th scope="col" className="px-4 py-4 text-start">
                            {t('الاسم', 'Name')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('إجمالي الالتزام', 'Total Amount')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('تاريخ التسجيل', 'Registration Date')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('تاريخ الاستحقاق', 'Due Date')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('المسدد', 'Paid')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('المتبقي', 'Remaining')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('الحالة', 'Status')}
                          </th>
                          <th scope="col" className="px-4 py-4 text-center">
                            {t('الإجراءات', 'Actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleObligations.map((row) => {
                          const metrics = obligationPeriodMetricsById.get(row.id)
                          const total = metrics?.periodTotal ?? Number(row.amount)
                          const paid = metrics?.periodPaid ?? 0
                          const rem = metrics?.periodRemaining ?? total

                          const isFullyPaid = rem <= 0.0001
                          const isPartiallyPaid = !isFullyPaid && paid > 0.0001

                          const statusText = isFullyPaid
                            ? t('مسدد بالكامل', 'Fully Paid')
                            : isPartiallyPaid
                              ? t('مسدد جزئي', 'Partially Paid')
                              : t('غير مسدد', 'Unpaid')

                          const statusColor = isFullyPaid
                            ? 'bg-emerald-100 text-emerald-700'
                            : isPartiallyPaid
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'

                          const name = locale === 'ar' ? row.name_ar : row.name_en

                          return (
                            <tr
                              key={row.id}
                              className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                            >
                              <td className="whitespace-nowrap px-4 py-4 text-start font-bold text-gray-900">
                                {name || t('بدون اسم', 'Unnamed')}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center font-bold text-gray-900"
                                dir="ltr"
                              >
                                {formatMoney(total, locale)}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center text-gray-500"
                                dir="ltr"
                              >
                                {row.date ? formatGregorianDate(parseLocalISODate(row.date), locale) : '-'}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center text-gray-500"
                                dir="ltr"
                              >
                                {row.due_date
                                  ? formatGregorianDate(parseLocalISODate(row.due_date), locale)
                                  : '-'}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center font-bold text-emerald-600"
                                dir="ltr"
                              >
                                {formatMoney(paid, locale)}
                              </td>

                              <td
                                className="whitespace-nowrap px-4 py-4 text-center font-bold text-rose-600"
                                dir="ltr"
                              >
                                {formatMoney(rem, locale)}
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-center">
                                <span className={cn('inline-flex rounded-md px-2.5 py-1 text-xs font-bold', statusColor)}>
                                  {statusText}
                                </span>
                              </td>

                              <td className="whitespace-nowrap px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {rem > 0.0001 ? (
                                    <button
                                      type="button"
                                      onClick={() => setPayObligation(row)}
                                      className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#1D4ED8]"
                                    >
                                      {t('سداد', 'Pay')}
                                    </button>
                                  ) : (
                                    <span className="inline-flex h-8 max-w-[9.5rem] items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/60">
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                                      <span className="leading-tight">{t('مسدَّد بالكامل', 'Fully paid')}</span>
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => openEditObligation(row)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-blue-600 transition-colors hover:bg-blue-50"
                                    title={t('تعديل', 'Edit')}
                                    aria-label={t('تعديل', 'Edit')}
                                  >
                                    <Pencil size={16} strokeWidth={2} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteObligation(row)}
                                    disabled={deletingId === row.id}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                    title={t('حذف', 'Delete')}
                                    aria-label={t('حذف', 'Delete')}
                                  >
                                    {deletingId === row.id ? (
                                      <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={16} strokeWidth={2} />
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
      </div>

      <GeneralOutflowModal
        open={generalModal}
        onClose={() => {
          setGeneralModal(false)
          setEditingOutflow(null)
        }}
        onSaved={reloadAll}
        edit={editingOutflow}
        availableCash={availableCash}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <ObligationFormModal
        open={obligationFormOpen}
        onClose={() => {
          setObligationFormOpen(false)
          setEditingObligation(null)
        }}
        onSaved={reloadAll}
        edit={editingObligation}
        markerPaidSum={
          editingObligation
            ? sumLegacyMarkerPayments(obligationPaymentOutflows, editingObligation.id)
            : 0
        }
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />

      <ObligationPayModal
        open={payObligation != null}
        onClose={() => setPayObligation(null)}
        onSaved={reloadAll}
        obligation={payObligation}
        markerPaidSum={
          payObligation
            ? sumLegacyMarkerPayments(obligationPaymentOutflows, payObligation.id)
            : 0
        }
        availableCash={availableCash}
        periodStart={periodDates.start}
        periodEnd={periodDates.end}
      />
    </div>
  )
}
