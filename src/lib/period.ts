/**
 * Period Calculation Logic
 * Each financial period runs from startDay of month N to (startDay - 1) of month N+1
 */

export interface PeriodDates {
  start: Date
  end: Date
}

/**
 * Returns the period key (YYYY-MM) for a given date and start day.
 * The period key represents the month in which the period STARTS.
 */
export function getPeriodKey(date: Date, startDay: number): string {
  let month = date.getMonth()
  let year = date.getFullYear()

  if (date.getDate() < startDay) {
    month--
    if (month < 0) {
      month = 11
      year--
    }
  }

  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Returns the start and end Date objects for a given period key and start day.
 */
export function getPeriodDates(key: string, startDay: number): PeriodDates {
  const [year, month] = key.split('-').map(Number)
  const start = new Date(year, month - 1, startDay)
  const end = new Date(year, month, startDay - 1)
  return { start, end }
}

/**
 * Returns the current period key based on today's date and the user's start day.
 */
export function getCurrentPeriodKey(startDay: number): string {
  return getPeriodKey(new Date(), startDay)
}

/**
 * Navigates to the next period key.
 */
export function getNextPeriodKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const next = new Date(year, month, 1) // month is already 1-based, so this goes to next month
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Navigates to the previous period key.
 */
export function getPrevPeriodKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const prev = new Date(year, month - 2, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Returns all 12 period keys for a given year and start day.
 * The year is determined by the reference start month.
 */
export function getYearPeriodKeys(
  referenceYear: number,
  referenceMonth: number,
  startDay: number
): string[] {
  const keys: string[] = []
  for (let i = 0; i < 12; i++) {
    let month = referenceMonth - 1 + i
    let year = referenceYear
    if (month > 11) {
      month -= 12
      year++
    }
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`)
  }
  return keys
}

function dateToOrd(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/**
 * First calendar instant of the financial year that contains `forDate`.
 * Financial year boundary = (fiscalStartMonth, startDay) each calendar year.
 */
export function getFiscalYearStartDate(
  forDate: Date,
  fiscalStartMonth: number,
  startDay: number
): Date {
  const y = forDate.getFullYear()
  const candidate = new Date(y, fiscalStartMonth - 1, startDay)
  if (dateToOrd(forDate) >= dateToOrd(candidate)) {
    return candidate
  }
  return new Date(y - 1, fiscalStartMonth - 1, startDay)
}

/**
 * Period key (YYYY-MM of period start month) for the first period of the fiscal year
 * that contains the given reference period.
 */
export function getFiscalYearFirstPeriodKey(
  referencePeriodKey: string,
  startDay: number,
  fiscalStartMonth: number
): string {
  const refStart = getPeriodDates(referencePeriodKey, startDay).start
  const fyStart = getFiscalYearStartDate(refStart, fiscalStartMonth, startDay)
  return getPeriodKey(fyStart, startDay)
}

/**
 * The 12 period keys of the fiscal year containing `referencePeriodKey`,
 * ordered as periods (1)…(12). Period (1) starts on (fiscalStartMonth, startDay).
 */
export function getFiscalYearPeriodKeys(
  referencePeriodKey: string,
  startDay: number,
  fiscalStartMonth: number
): string[] {
  const first = getFiscalYearFirstPeriodKey(referencePeriodKey, startDay, fiscalStartMonth)
  const [y, m] = first.split('-').map(Number)
  return getYearPeriodKeys(y, m, startDay)
}

/** 1-based index of `periodKey` within a fiscal year sequence, or null if not in the list */
export function getFiscalPeriodNumber1Based(
  periodKey: string,
  fiscalYearKeys: string[]
): number | null {
  const i = fiscalYearKeys.indexOf(periodKey)
  return i === -1 ? null : i + 1
}

/**
 * اختصارات الأشهر بالإنجليزية — تُستخدم في واجهة العربية والإنجليزية معاً
 * لتفادي اختلال ترتيب النص (BiDi) عند خلط أرقام لاتينية مع أسماء أشهر عربية.
 */
const MONTH_ABBREV_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Formats a single date as "DD Mon YYYY" (day first). Month is always an English abbreviation.
 */
function formatDate(date: Date, _locale: 'ar' | 'en'): string {
  const day = date.getDate()
  const month = MONTH_ABBREV_EN[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

/**
 * Formats a period date range for display.
 * Returns { startLabel, endLabel } separately so the caller can wrap each in dir="ltr".
 * Month names are always English abbreviations (Jan, Feb, …) in both UI languages.
 */
export function formatPeriodRange(
  key: string,
  startDay: number,
  locale: 'ar' | 'en'
): { startLabel: string; endLabel: string } {
  const { start, end } = getPeriodDates(key, startDay)
  return {
    startLabel: formatDate(start, locale),
    endLabel: formatDate(end, locale),
  }
}

/**
 * Formats a single date as "DD Mon YYYY" for display. Month is always an English abbreviation
 * (same in Arabic and English UI) for consistent LTR reading order.
 */
export function formatGregorianDate(date: Date, locale: 'ar' | 'en'): string {
  return formatDate(date, locale)
}

/**
 * Checks if a date string falls within a given period.
 */
export function isDateInPeriod(
  dateStr: string,
  periodKey: string,
  startDay: number
): boolean {
  const date = new Date(dateStr)
  return getPeriodKey(date, startDay) === periodKey
}
