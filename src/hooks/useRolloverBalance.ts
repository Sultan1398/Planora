'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dateToLocalISODate } from '@/lib/date-local'
import { getPeriodDates, getPrevPeriodKey } from '@/lib/period'

export function useRolloverBalance({
  periodKey,
  periodDates,
  startDay,
  userId,
  previousComponents,
}: {
  periodKey: string
  periodDates: { start: Date; end: Date }
  startDay: number
  userId?: string | null
  /**
   * Optional override to avoid double-fetching in places that already loaded previous-period components.
   * When provided, the hook will compute rolled-over values from these numbers.
   */
  previousComponents?: {
    incomePrev: number
    totalPaidFromWalletPrev: number
    savingsNetPrev: number
    investmentsNetPrev: number
  }
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rolledOverBalance, setRolledOverBalance] = useState(0)
  const [rolledOverBalanceRaw, setRolledOverBalanceRaw] = useState(0)

  const load = useCallback(
    async (isStillMounted: () => boolean = () => true) => {
      if (!isStillMounted()) return
      setLoading(true)
      setError('')

      if (previousComponents) {
        const rolledRaw =
          previousComponents.incomePrev -
          previousComponents.totalPaidFromWalletPrev -
          previousComponents.savingsNetPrev -
          previousComponents.investmentsNetPrev
        const rolled = Math.max(0, rolledRaw)
        setRolledOverBalance(rolled)
        setRolledOverBalanceRaw(rolledRaw)
        setLoading(false)
        return
      }

      const supabase = createClient()

      let uid = userId ?? null
      if (!uid) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!isStillMounted()) return
        uid = user?.id ?? null
      }

      if (!uid) {
        if (!isStillMounted()) return
        setRolledOverBalance(0)
        setRolledOverBalanceRaw(0)
        setLoading(false)
        return
      }

      const prevPeriodKey = getPrevPeriodKey(periodKey)
      const prevPeriodDates = getPeriodDates(prevPeriodKey, startDay)
      const prevStart = dateToLocalISODate(prevPeriodDates.start)
      const prevEnd = dateToLocalISODate(prevPeriodDates.end)

      const [inflowsPrevRes, outflowsPrevRes, savingsPrevRes, invWalletPrevRes] = await Promise.all([
        supabase
          .from('inflows')
          .select('amount')
          .eq('user_id', uid)
          .gte('date', prevStart)
          .lte('date', prevEnd),
        supabase
          .from('outflows')
          .select('amount,status')
          .eq('user_id', uid)
          .gte('date', prevStart)
          .lte('date', prevEnd),
        supabase
          .from('savings_transactions')
          .select('amount,type')
          .eq('user_id', uid)
          .gte('date', prevStart)
          .lte('date', prevEnd),
        supabase
          .from('investment_wallet_transactions')
          .select('amount, type')
          .eq('user_id', uid)
          .gte('date', prevStart)
          .lte('date', prevEnd)
          .in('type', ['deposit', 'withdrawal'] as const),
      ])

      if (!isStillMounted()) return

      const firstErr =
        inflowsPrevRes.error || outflowsPrevRes.error || savingsPrevRes.error || invWalletPrevRes.error
      if (firstErr) {
        setError(firstErr.message)
        setRolledOverBalance(0)
        setRolledOverBalanceRaw(0)
        setLoading(false)
        return
      }

      const inflowPrev = (inflowsPrevRes.data ?? []) as Array<{ amount: number }>
      const outflowPrev = (outflowsPrevRes.data ?? []) as Array<{ amount: number; status: string }>
      const savingsPrev = (savingsPrevRes.data ?? []) as Array<{ amount: number; type: string }>
      const invWalletPrev = (invWalletPrevRes.data ?? []) as Array<{ amount: number; type: string }>

      let incomePrev = 0
      for (const r of inflowPrev) incomePrev += Number(r.amount)

      // إجمالي ما تم صرفه في الفترة السابقة من المحفظة:
      // - مصروفات عامة مدفوعة
      // - + سداد التزامات (لأنها تُسجل كذلك كـ outflows status=paid)
      let totalPaidFromWalletPrev = 0
      for (const r of outflowPrev) {
        if (r.status === 'paid') totalPaidFromWalletPrev += Number(r.amount)
      }

      let savingsNetPrev = 0
      for (const r of savingsPrev) {
        const a = Number(r.amount)
        if (r.type === 'deposit') savingsNetPrev += a
        else savingsNetPrev -= a
      }

      let investmentsNetPrev = 0
      for (const r of invWalletPrev) {
        const a = Number(r.amount)
        if (r.type === 'deposit') investmentsNetPrev += a
        else investmentsNetPrev -= a
      }

      const rolledRaw =
        incomePrev - totalPaidFromWalletPrev - savingsNetPrev - investmentsNetPrev
      const rolled = Math.max(0, rolledRaw)

      setRolledOverBalance(rolled)
      setRolledOverBalanceRaw(rolledRaw)
      setLoading(false)
    },
    [periodKey, startDay, userId, previousComponents]
  )

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    // تأجيل الجلب لتجنب setState متزامن داخل effect
    queueMicrotask(() => {
      if (!isMounted) return
      void load(isStillMounted)
    })
    return () => {
      isMounted = false
    }
  }, [load, periodKey, startDay])

  return {
    loading,
    error,
    rolledOverBalance,
    rolledOverBalanceRaw,
    reload: load,
  }
}

