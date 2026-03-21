'use client'

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  getCurrentPeriodKey,
  getNextPeriodKey,
  getPrevPeriodKey,
  getPeriodDates,
  formatPeriodRange,
  getFiscalYearPeriodKeys,
  getFiscalPeriodNumber1Based,
} from '@/lib/period'
import { useLanguage } from './LanguageContext'

interface PeriodContextValue {
  periodKey: string
  periodDates: { start: Date; end: Date }
  /** Start date label e.g. "25 Mar 2026" */
  periodStartLabel: string
  /** End date label e.g. "24 Apr 2026" */
  periodEndLabel: string
  startDay: number
  /** Calendar month (1–12) when the financial year begins */
  fiscalStartMonth: number
  /** Period index 1–12 within the fiscal year that contains the selected period */
  fiscalPeriodNumber: number | null
  setStartDay: (day: number) => void
  setFiscalStartMonth: (month: number) => void
  /** After saving day + month from settings: updates context; jumps to current period only if day changed */
  applySavedPeriodProfile: (day: number, month: number, previousDay: number) => void
  goNext: () => void
  goPrev: () => void
  goToCurrent: () => void
  isCurrentPeriod: boolean
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function PeriodProvider({
  children,
  initialStartDay = 1,
  initialFiscalStartMonth = 1,
}: {
  children: ReactNode
  initialStartDay?: number
  initialFiscalStartMonth?: number
}) {
  const { locale } = useLanguage()
  const [startDay, setStartDayState] = useState(initialStartDay)
  const [fiscalStartMonth, setFiscalStartMonthState] = useState(initialFiscalStartMonth)
  const [periodKey, setPeriodKey] = useState(() => getCurrentPeriodKey(initialStartDay))

  const currentKey = getCurrentPeriodKey(startDay)

  const goNext = () => setPeriodKey((k) => getNextPeriodKey(k))
  const goPrev = () => setPeriodKey((k) => getPrevPeriodKey(k))
  const goToCurrent = useCallback(() => setPeriodKey(getCurrentPeriodKey(startDay)), [startDay])

  const setStartDay = useCallback((day: number) => {
    setStartDayState(day)
    setPeriodKey(getCurrentPeriodKey(day))
  }, [])

  const setFiscalStartMonth = useCallback((month: number) => {
    setFiscalStartMonthState(month)
  }, [])

  const applySavedPeriodProfile = useCallback(
    (day: number, month: number, previousDay: number) => {
      setFiscalStartMonthState(month)
      setStartDayState(day)
      if (day !== previousDay) {
        setPeriodKey(getCurrentPeriodKey(day))
      }
    },
    []
  )

  const fiscalYearKeys = useMemo(
    () => getFiscalYearPeriodKeys(periodKey, startDay, fiscalStartMonth),
    [periodKey, startDay, fiscalStartMonth]
  )

  const fiscalPeriodNumber = useMemo(
    () => getFiscalPeriodNumber1Based(periodKey, fiscalYearKeys),
    [periodKey, fiscalYearKeys]
  )

  const periodDates = getPeriodDates(periodKey, startDay)
  const { startLabel, endLabel } = formatPeriodRange(periodKey, startDay, locale)

  return (
    <PeriodContext.Provider
      value={{
        periodKey,
        periodDates,
        periodStartLabel: startLabel,
        periodEndLabel: endLabel,
        startDay,
        fiscalStartMonth,
        fiscalPeriodNumber,
        setStartDay,
        setFiscalStartMonth,
        applySavedPeriodProfile,
        goNext,
        goPrev,
        goToCurrent,
        isCurrentPeriod: periodKey === currentKey,
      }}
    >
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider')
  return ctx
}
