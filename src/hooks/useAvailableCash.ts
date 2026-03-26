'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeAvailableCash } from '@/lib/cash-liquidity'
import { useRolloverBalance } from '@/hooks/useRolloverBalance'
import { dateToLocalISODate } from '@/lib/date-local'

export function useAvailableCash({
  periodKey,
  periodDates,
  startDay,
  userId,
}: {
  periodKey: string
  periodDates: { start: Date; end: Date }
  startDay: number
  userId?: string | null
}) {
  const start = dateToLocalISODate(periodDates.start)
  const end = dateToLocalISODate(periodDates.end)

  const {
    rolledOverBalanceRaw,
    loading: rolloverLoading,
    error: rolloverError,
    reload: reloadRollover,
  } = useRolloverBalance({
    periodKey,
    periodDates,
    startDay,
    userId,
  })

  const [cashCurrent, setCashCurrent] = useState<number | null>(null)
  const [cashLoading, setCashLoading] = useState(true)
  const [cashError, setCashError] = useState('')

  const loadCurrent = useCallback(
    async (isStillMounted: () => boolean = () => true) => {
      if (!isStillMounted()) return
      setCashLoading(true)
      setCashError('')

      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isStillMounted()) return
      if (!user) {
        setCashCurrent(null)
        setCashLoading(false)
        return
      }

      try {
        const cash = await computeAvailableCash(supabase, user.id, start, end)
        if (!isStillMounted()) return
        setCashCurrent(cash)
      } catch (e) {
        if (!isStillMounted()) return
        const msg = e instanceof Error ? e.message : String(e)
        setCashCurrent(null)
        setCashError(msg)
      } finally {
        if (!isStillMounted()) return
        setCashLoading(false)
      }
    },
    [start, end]
  )

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted

    // عند تغيير الفترة: نعيد حساب السيولة الحالية و(بحكم useRolloverBalance) الرصيد المرحّل.
    queueMicrotask(() => {
      if (!isMounted) return
      void loadCurrent(isStillMounted)
    })

    return () => {
      isMounted = false
    }
  }, [loadCurrent, periodKey])

  const availableCash = useMemo(() => {
    if (cashCurrent == null) return null
    return rolledOverBalanceRaw + cashCurrent
  }, [cashCurrent, rolledOverBalanceRaw])

  const loading = rolloverLoading || cashLoading
  const error = useMemo(() => {
    return [rolloverError, cashError].filter(Boolean).join(' · ')
  }, [rolloverError, cashError])

  const reload = useCallback(async () => {
    // الرصيد المرحّل يعتمد على periodKey، وحساب current يعتمد على start/end.
    // لو تم الاستدعاء بعد عمليات حفظ ضمن نفس الفترة، يكفي تحديث current.
    await loadCurrent(() => true)
  }, [loadCurrent])

  return {
    availableCash,
    loading,
    error,
    reload,
    rolledOverBalanceRaw,
  }
}

