'use client'

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { usePeriod } from '@/contexts/PeriodContext'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import {
  obligationRemaining,
  sumLegacyMarkerPayments,
} from '@/lib/obligation-helpers'
import type { Obligation } from '@/types/database'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const LS_PREFIX = 'planora:financial-reminder:'

function calendarDaysFromStart(periodStart: Date, today: Date): number {
  const a = dateToLocalISODate(periodStart)
  const b = dateToLocalISODate(today)
  const s = parseLocalISODate(a)
  const t = parseLocalISODate(b)
  return Math.round((t.getTime() - s.getTime()) / 86_400_000)
}

function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + days)
  return d
}

function setDismissedStorage(storageId: string) {
  localStorage.setItem(LS_PREFIX + storageId, '1')
}

type ObligationReminder = { id: string; name: string }

export function FinancialReminders() {
  const { t, locale } = useLanguage()
  const { periodKey, periodDates } = usePeriod()
  const [obligationReminders, setObligationReminders] = useState<ObligationReminder[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const dismiss = useCallback((id: string) => {
    setDismissedStorage(id)
    setDismissed((prev) => new Set(prev).add(id))
  }, [])

  const { inSelectedPeriod, daysSinceStart } = useMemo(() => {
    const today = new Date()
    const tStr = dateToLocalISODate(today)
    const sStr = dateToLocalISODate(periodDates.start)
    const eStr = dateToLocalISODate(periodDates.end)
    return {
      inSelectedPeriod: tStr >= sStr && tStr <= eStr,
      daysSinceStart: calendarDaysFromStart(periodDates.start, today),
    }
  }, [periodDates.start, periodDates.end])

  const periodReminders = useMemo((): { id: string; message: string }[] => {
    if (!inSelectedPeriod) return []
    const out: { id: string; message: string }[] = []

    if (daysSinceStart === 0) {
      out.push({
        id: `${periodKey}:start`,
        message: t(
          'صباح الخير! بدأت فترة مالية جديدة، لا تنسَ تسجيل دخلك الجديد لتبدأ التخطيط بذكاء. 🌱',
          'Good morning! A new financial period has started — log your new income to plan with clarity. 🌱'
        ),
      })
    }
    if (daysSinceStart === 5) {
      out.push({
        id: `${periodKey}:d5`,
        message: t(
          'مرت 5 أيام.. هل قمت باستقطاع مبلغ للمدخرات؟ ادخار القليل اليوم يصنع فرقاً كبيراً غداً. 💰',
          'Five days in — have you set aside something for savings? A little today makes a big difference tomorrow. 💰'
        ),
      })
    }
    if (daysSinceStart === 10) {
      out.push({
        id: `${periodKey}:d10`,
        message: t(
          'حان وقت نمو أموالك! 📈 فكّر في استثمار جزء من دخلك اليوم لتعزيز محفظتك الاستثمارية.',
          'Time to grow your money! 📈 Consider investing part of your income to strengthen your portfolio.'
        ),
      })
    }
    return out
  }, [inSelectedPeriod, daysSinceStart, periodKey, t])

  const reminderIdsKey = useMemo(
    () =>
      [
        ...periodReminders.map((r) => r.id),
        ...obligationReminders.map((o) => o.id),
      ].join('\0'),
    [periodReminders, obligationReminders]
  )

  useEffect(() => {
    const ids = [
      ...periodReminders.map((r) => r.id),
      ...obligationReminders.map((o) => o.id),
    ]
    const next = new Set<string>()
    for (const id of ids) {
      try {
        if (localStorage.getItem(LS_PREFIX + id) === '1') next.add(id)
      } catch {
        /* ignore */
      }
    }
    startTransition(() => {
      setDismissed(() => next)
    })
  }, [reminderIdsKey, periodReminders, obligationReminders])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !mounted) {
        if (mounted) setObligationReminders([])
        return
      }

      const todayStr = dateToLocalISODate(new Date())

      const [oblRes, outRes] = await Promise.all([
        supabase.from('obligations').select('*').eq('user_id', user.id),
        supabase.from('outflows').select('amount, name_ar, name_en').eq('user_id', user.id),
      ])

      if (!mounted) return

      const outflows =
        (outRes.data as Array<{ amount: number; name_ar?: string | null; name_en?: string | null }> | null) ??
        []
      const obligations = (oblRes.data as Obligation[] | null) ?? []

      const today = parseLocalISODate(todayStr)
      const windowEnd = addDaysLocal(today, 3)

      const next: ObligationReminder[] = []
      for (const obl of obligations) {
        const dueStr = obl.due_date
        if (!dueStr) continue
        const due = parseLocalISODate(dueStr)
        if (due < today || due > windowEnd) continue
        const marker = sumLegacyMarkerPayments(outflows, obl.id)
        const rem = obligationRemaining(obl, marker)
        if (rem <= 0.0001) continue
        const name = locale === 'ar' ? obl.name_ar : obl.name_en
        next.push({
          id: `obl:${obl.id}:${dueStr}`,
          name: (name || obl.name_en || obl.name_ar || '').trim(),
        })
      }
      setObligationReminders(next)
    })()
    return () => {
      mounted = false
    }
  }, [locale])

  const obligationMessages = useMemo(() => {
    return obligationReminders.map((o) => ({
      id: o.id,
      message: t(
        `موعد سداد «${o.name}» اقترب، تأكد من توفر السيولة الكافية. 🔔`,
        `«${o.name}» is due soon — make sure you have enough liquidity. 🔔`
      ),
    }))
  }, [obligationReminders, t])

  const visiblePeriod = periodReminders.filter((r) => !dismissed.has(r.id))
  const visibleObl = obligationMessages.filter((r) => !dismissed.has(r.id))

  if (visiblePeriod.length === 0 && visibleObl.length === 0) return null

  return (
    <div className="mb-4 flex flex-col gap-2 sm:gap-3" role="region" aria-label={t('تذكيرات مالية', 'Financial reminders')}>
      {visiblePeriod.map((r) => (
        <ReminderCard
          key={r.id}
          message={r.message}
          variant="general"
          onDismiss={() => dismiss(r.id)}
          dismissLabel={t('إخفاء التذكير', 'Dismiss reminder')}
        />
      ))}
      {visibleObl.map((r) => (
        <ReminderCard
          key={r.id}
          message={r.message}
          variant="obligation"
          onDismiss={() => dismiss(r.id)}
          dismissLabel={t('إخفاء التذكير', 'Dismiss reminder')}
        />
      ))}
    </div>
  )
}

function ReminderCard({
  message,
  variant,
  onDismiss,
  dismissLabel,
}: {
  message: string
  variant: 'general' | 'obligation'
  onDismiss: () => void
  dismissLabel: string
}) {
  return (
    <div
      className={cn(
        'relative rounded-xl border px-3 py-2.5 pe-10 text-sm leading-relaxed shadow-sm sm:px-4 sm:py-3',
        variant === 'general' && 'border-blue-100 bg-blue-50 text-slate-800',
        variant === 'obligation' &&
          'border-[#E8D4BC] bg-[#FDF6EC] text-slate-800 shadow-[0_1px_2px_rgba(180,130,70,0.06)]'
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          'absolute top-2 end-2 inline-flex h-8 w-8 items-center justify-center rounded-lg',
          'text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
        )}
        aria-label={dismissLabel}
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
      <p className="text-pretty">{message}</p>
    </div>
  )
}
