'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Obligation } from '@/types/database'

export type ObligationPaymentRow = {
  amount: number
  date: string
  obligation_id?: string | null
  name_ar?: string | null
  name_en?: string | null
}

export type ObligationPeriodMetrics = {
  periodTotal: number
  periodPaid: number
  periodRemaining: number
}

export type PeriodObligationsSummary = {
  totalObligations: number
  totalPaid: number
  totalRemaining: number
}

function resolveObligationId(row: ObligationPaymentRow): string | null {
  if (row.obligation_id) return row.obligation_id
  const hay = `${row.name_ar ?? ''}\n${row.name_en ?? ''}`
  const match = hay.match(/\[\[planora-obl:([a-f0-9-]{36})\]\]/i)
  return match?.[1] ?? null
}

export function usePeriodObligations({
  periodStart,
  periodEnd,
  userId,
}: {
  periodStart: string
  periodEnd: string
  userId?: string | null
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [allObligations, setAllObligations] = useState<Obligation[]>([])
  const [paymentRows, setPaymentRows] = useState<ObligationPaymentRow[]>([])

  const load = useCallback(async (isStillMounted: () => boolean = () => true) => {
    if (!isStillMounted()) return
    setLoading(true)
    setError('')
    setAllObligations([])
    setPaymentRows([])

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
      setLoading(false)
      return
    }

    const [oblRes, payRes] = await Promise.all([
      supabase
        .from('obligations')
        .select('*')
        .eq('user_id', uid)
        .lte('date', periodEnd)
        .order('due_date', { ascending: true }),
      supabase
        .from('outflows')
        // توافق المخطط القديم: لا نذكر obligation_id صراحةً
        .select('*')
        .eq('user_id', uid)
        .eq('status', 'paid')
        .lte('date', periodEnd),
    ])

    if (!isStillMounted()) return

    if (oblRes.error || payRes.error) {
      setError(oblRes.error?.message ?? payRes.error?.message ?? 'Failed to load obligations')
      setAllObligations([])
      setPaymentRows([])
      setLoading(false)
      return
    }

    setAllObligations((oblRes.data as Obligation[] | null) ?? [])
    setPaymentRows((payRes.data as ObligationPaymentRow[] | null) ?? [])
    setLoading(false)
  }, [periodEnd, userId])

  useEffect(() => {
    let isMounted = true
    const isStillMounted = () => isMounted
    queueMicrotask(() => {
      if (!isMounted) return
      void load(isStillMounted)
    })
    return () => {
      isMounted = false
    }
  }, [load, periodStart, periodEnd])

  const derived = useMemo(() => {
    const paymentsBeforeByObligation = new Map<string, number>()
    const paymentsInPeriodByObligation = new Map<string, number>()

    for (const payment of paymentRows) {
      const obligationId = resolveObligationId(payment)
      if (!obligationId) continue
      const amount = Number(payment.amount) || 0
      if (payment.date < periodStart) {
        paymentsBeforeByObligation.set(
          obligationId,
          (paymentsBeforeByObligation.get(obligationId) ?? 0) + amount
        )
      } else if (payment.date >= periodStart && payment.date <= periodEnd) {
        paymentsInPeriodByObligation.set(
          obligationId,
          (paymentsInPeriodByObligation.get(obligationId) ?? 0) + amount
        )
      }
    }

    const obligationPeriodMetricsById = new Map<string, ObligationPeriodMetrics>()
    const visibleObligations: Obligation[] = []
    let periodTotal = 0
    let paidInPeriod = 0

    for (const row of allObligations) {
      if (row.date > periodEnd) continue

      const lifetimeTotal = Number(row.amount) || 0
      const paidBefore = paymentsBeforeByObligation.get(row.id) ?? 0
      const paidNow = paymentsInPeriodByObligation.get(row.id) ?? 0

      const isCarryover = row.date < periodStart
      const openingRemaining = Math.max(0, lifetimeTotal - paidBefore)
      const periodBase = isCarryover ? openingRemaining : lifetimeTotal
      if (periodBase <= 0.0001) continue

      const periodPaid = Math.min(paidNow, periodBase)
      const periodRemaining = Math.max(0, periodBase - periodPaid)

      visibleObligations.push(row)
      obligationPeriodMetricsById.set(row.id, {
        periodTotal: periodBase,
        periodPaid,
        periodRemaining,
      })
      periodTotal += periodBase
      paidInPeriod += periodPaid
    }

    const summary: PeriodObligationsSummary = {
      totalObligations: periodTotal,
      totalPaid: Math.min(periodTotal, paidInPeriod),
      totalRemaining: Math.max(0, periodTotal - Math.min(periodTotal, paidInPeriod)),
    }

    return {
      summary,
      visibleObligations,
      obligationPeriodMetricsById,
      paymentRows,
      allObligations,
    }
  }, [allObligations, paymentRows, periodStart, periodEnd])

  return {
    loading,
    error,
    reload: load,
    ...derived,
  }
}

