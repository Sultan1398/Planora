'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { obligationRemaining, sumLegacyMarkerPayments } from '@/lib/obligation-helpers'
import { getCurrentPeriodKey, getPeriodDates } from '@/lib/period'
import type { Obligation } from '@/types/database'
import { AlertTriangle, Bell, Inbox, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISSED_KEY = 'planora:dismissedNotifications'

type NotificationItem = {
  id: string
  obligationId: string
  title: string
  subtitle: string
}

type NotificationBellProps = {
  sidebarMode?: boolean
}

function readDismissedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr)
  } catch {
    return new Set()
  }
}

function writeDismissedSet(set: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // ignore localStorage failures
  }
}

export function NotificationBell({ sidebarMode = false }: NotificationBellProps) {
  const { t, locale } = useLanguage()
  const { startDay } = usePeriod()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    setDismissed(readDismissedSet())
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return
      if (!user) {
        setItems([])
        return
      }

      const [obligationsRes, outflowsRes] = await Promise.all([
        supabase.from('obligations').select('*').eq('user_id', user.id),
        supabase.from('outflows').select('amount, name_ar, name_en').eq('user_id', user.id),
      ])

      if (!mounted) return
      if (obligationsRes.error || outflowsRes.error) {
        setItems([])
        return
      }

      // حدود الدورة المالية الحالية محسوبة من startDay + تاريخ اليوم
      const currentKey = getCurrentPeriodKey(startDay)
      const { start: periodStartDate, end: periodEndDate } = getPeriodDates(currentKey, startDay)
      const periodStartStr = dateToLocalISODate(periodStartDate)
      const periodEndStr = dateToLocalISODate(periodEndDate)
      const todayStr = dateToLocalISODate(new Date())
      const today = parseLocalISODate(todayStr)
      const obligations = (obligationsRes.data as Obligation[] | null) ?? []
      const markerOutflows =
        (outflowsRes.data as Array<{ amount: number; name_ar?: string | null; name_en?: string | null }> | null) ?? []

      const nextItems: NotificationItem[] = []
      for (const obl of obligations) {
        const dueStr = obl.due_date
        if (!dueStr) continue
        // عرض التزامات الدورة الحالية والمتأخرات فقط: due <= periodEnd
        // مع إخفاء أي التزامات مستقبلية بعد نهاية الدورة الحالية.
        if (dueStr > periodEndStr) continue

        const markerPaid = sumLegacyMarkerPayments(markerOutflows, obl.id)
        const remaining = obligationRemaining(obl, markerPaid)
        if (remaining <= 0.0001) continue

        const due = parseLocalISODate(dueStr)
        const isOverdue = due < today || dueStr < periodStartStr
        const title = isOverdue
          ? t('التزام متأخر', 'Overdue obligation')
          : t('التزام ضمن الدورة الحالية', 'Current period obligation')
        const obligationName = locale === 'ar' ? obl.name_ar : obl.name_en
        const subtitle = isOverdue
          ? t(
              `«${obligationName}» لم يُسدّد بعد. يُنصح بمعالجته خلال هذه الدورة.`,
              `“${obligationName}” is still unpaid. It should be handled this period.`
            )
          : t(
              `«${obligationName}» ضمن الدورة الحالية. تأكد من توفر السيولة قبل الاستحقاق.`,
              `“${obligationName}” falls in the current period. Ensure liquidity before due date.`
            )

        nextItems.push({
          id: `obl:${obl.id}:${dueStr}`,
          obligationId: obl.id,
          title,
          subtitle,
        })
      }

      setItems(nextItems)
    })()

    return () => {
      mounted = false
    }
  }, [locale, startDay, t])

  const visibleItems = useMemo(
    () => items.filter((item) => !dismissed.has(item.id)),
    [items, dismissed]
  )

  function dismissNotification(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      writeDismissedSet(next)
      return next
    })
  }

  return (
    <div className="relative overflow-visible">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white',
          'text-slate-700 shadow-sm transition-colors hover:bg-surface'
        )}
        aria-label={t('الإشعارات', 'Notifications')}
      >
        <Bell className="h-5 w-5" />
        {visibleItems.length > 0 ? (
          <span
            className={cn(
              'absolute -end-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full',
              'bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white'
            )}
          >
            {visibleItems.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30"
            aria-label={t('إغلاق الإشعارات', 'Close notifications')}
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              sidebarMode
                ? 'absolute bottom-0 z-[100] w-[calc(100vw-2rem)] sm:w-80 md:w-96 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/[0.05] rtl:right-full ltr:left-full rtl:mr-4 ltr:ml-4'
                : 'absolute end-0 z-40 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl ring-1 ring-black/[0.05]'
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-bold text-slate-900">{t('الإشعارات', 'Notifications')}</p>
              <span className="text-xs text-muted">{visibleItems.length}</span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {visibleItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted">
                  <Inbox className="h-6 w-6 text-slate-400" />
                  <p className="text-sm">{t('لا توجد إشعارات جديدة', 'No new notifications')}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {visibleItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 rounded-lg bg-amber-100 p-1.5 text-amber-700">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-0.5 whitespace-normal break-words text-sm leading-relaxed text-slate-600">
                            {item.subtitle}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissNotification(item.id)}
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                          aria-label={t('إخفاء الإشعار', 'Dismiss notification')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
