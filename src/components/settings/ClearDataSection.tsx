'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import { formatPeriodRange, getFiscalYearPeriodKeys } from '@/lib/period'
import { deleteAllUserFinancialData, deleteUserFinancialDataInPeriod } from '@/lib/user-data-delete'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Mode = 'period' | 'all'

const CONFIRM_ALL_TOKEN = 'DELETE'

export function ClearDataSection() {
  const { t, locale } = useLanguage()
  const router = useRouter()
  const { periodKey, startDay, fiscalStartMonth } = usePeriod()

  const [mode, setMode] = useState<Mode>('period')
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(periodKey)
  const [modalOpen, setModalOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const fiscalKeys = useMemo(
    () => getFiscalYearPeriodKeys(periodKey, startDay, fiscalStartMonth),
    [periodKey, startDay, fiscalStartMonth]
  )

  const periodOptions = useMemo(() => {
    return fiscalKeys.map((key, i) => ({
      key,
      num: i + 1,
      label: String(i + 1),
    }))
  }, [fiscalKeys])

  useEffect(() => {
    if (!fiscalKeys.includes(selectedPeriodKey)) {
      setSelectedPeriodKey(fiscalKeys[0] ?? periodKey)
    }
  }, [fiscalKeys, selectedPeriodKey, periodKey])

  function openModal() {
    setError('')
    setUnderstood(false)
    setConfirmInput('')
    setModalOpen(true)
  }

  function closeModal() {
    if (busy) return
    setModalOpen(false)
  }

  async function executeDelete() {
    setBusy(true)
    setError('')
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError(t('يرجى تسجيل الدخول مجدداً', 'Please sign in again'))
      setBusy(false)
      return
    }

    let result
    if (mode === 'period') {
      result = await deleteUserFinancialDataInPeriod(supabase, user.id, selectedPeriodKey, startDay)
    } else {
      result = await deleteAllUserFinancialData(supabase, user.id)
    }

    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }

    setModalOpen(false)
    router.refresh()
  }

  const canSubmit =
    understood &&
    (mode === 'period' || confirmInput.trim() === CONFIRM_ALL_TOKEN) &&
    !busy

  const selectedRange = formatPeriodRange(selectedPeriodKey, startDay, locale)

  return (
    <>
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <Trash2 className="text-red-600" size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t('مسح البيانات', 'Clear data')}
            </h2>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-red-100 bg-white/80 p-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('نوع المسح', 'Deletion type')}</legend>
            <div className="rounded-lg border border-border p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
              <div className="flex flex-row flex-wrap items-center justify-start gap-x-8 gap-y-4 sm:gap-x-10">
                <label className="flex shrink-0 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="clear-mode"
                    checked={mode === 'period'}
                    onChange={() => setMode('period')}
                    className="shrink-0"
                  />
                  <span className="text-sm font-semibold text-slate-900">
                    {t('مسح بيانات فترة معيّنة', 'Delete data for one period')}
                  </span>
                </label>
                {mode === 'period' ? (
                  <div className="flex shrink-0 flex-col gap-1">
                    <label htmlFor="clear-period-select" className="text-xs font-semibold text-muted">
                      {t('اختر الفترة', 'Choose period')}
                    </label>
                    <select
                      id="clear-period-select"
                      value={selectedPeriodKey}
                      onChange={(e) => setSelectedPeriodKey(e.target.value)}
                      className="min-w-[4.5rem] rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30"
                      dir="ltr"
                    >
                      {periodOptions.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-red-300 has-[:checked]:bg-red-50/60">
              <input
                type="radio"
                name="clear-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                className="mt-1"
              />
              <span className="block text-sm font-semibold text-red-800">
                {t('مسح جميع البيانات المدخلة', 'Delete all entered data')}
              </span>
            </label>
          </fieldset>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={openModal}
              className="min-w-[8rem] rounded-xl bg-red-600 px-8 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
            >
              {t('حذف', 'Delete')}
            </button>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-data-modal-title"
        >
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={closeModal}
              disabled={busy}
              className="absolute end-4 top-4 rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-50"
              aria-label={t('إغلاق', 'Close')}
            >
              <X size={20} />
            </button>

            <div className="flex items-start gap-3 pe-10">
              <AlertTriangle className="shrink-0 text-amber-500" size={28} />
              <div>
                <h3 id="clear-data-modal-title" className="text-lg font-bold text-slate-900">
                  {t('تأكيد الحذف النهائي', 'Confirm permanent deletion')}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {t(
                    'البيانات التي تُمسح لا يمكن استرجاعها. لن نتمكن من استعادتها من الخادم.',
                    'Deleted data cannot be recovered. We cannot restore it from the server.'
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {mode === 'period' ? (
                <p dir="ltr" className="tabular-nums">
                  <strong>{t('الفترة:', 'Period:')}</strong> {selectedRange.startLabel} — {selectedRange.endLabel}
                </p>
              ) : (
                <p className="font-semibold">{t('سيتم مسح كل بياناتك المالية.', 'All your financial data will be removed.')}</p>
              )}
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t('أفهم أن الحذف نهائي ولا يمكن التراجع عنه', 'I understand this is permanent and cannot be undone')}</span>
            </label>

            {mode === 'all' ? (
              <div className="mt-4">
                <label htmlFor="clear-confirm-input" className="mb-1 block text-xs font-semibold text-muted">
                  {t('اكتب DELETE بالأحرف الإنجليزية للتأكيد', 'Type DELETE in capital letters to confirm')}
                </label>
                <input
                  id="clear-confirm-input"
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-xl border border-border px-3 py-2.5 font-mono text-sm focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="DELETE"
                  dir="ltr"
                />
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void executeDelete()}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white sm:flex-none min-w-[8rem]',
                  'bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {busy ? <Loader2 className="animate-spin" size={18} /> : null}
                {busy ? t('جاري المسح…', 'Deleting…') : t('نعم، امسح', 'Yes, delete')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeModal}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-surface"
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
