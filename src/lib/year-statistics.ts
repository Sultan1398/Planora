import { createClient } from '@/lib/supabase/client'
import { getPeriodDates, getPeriodKey, getFiscalYearPeriodKeys } from '@/lib/period'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'
import { outflowIsObligationLinkedExpense } from '@/lib/obligation-helpers'

type Supabase = ReturnType<typeof createClient>

export type YearStatisticsRow = {
  periodKey: string
  income: number
  /** مصروفات عامة مدفوعة (غير مرتبطة بالالتزام) */
  generalExpensesPaid: number
  /** سداد التزامات (مصروفات مدفوعة مرتبطة) */
  obligationPaymentsPaid: number
  invDeposit: number
  invWithdrawal: number
  /** ربح/خسارة محققة عند الإغلاق في الفترة */
  invRealizedProfit: number
  savDeposit: number
  savWithdrawal: number
}

function emptyBucket(): Omit<YearStatisticsRow, 'periodKey'> {
  return {
    income: 0,
    generalExpensesPaid: 0,
    obligationPaymentsPaid: 0,
    invDeposit: 0,
    invWithdrawal: 0,
    invRealizedProfit: 0,
    savDeposit: 0,
    savWithdrawal: 0,
  }
}

function bucketForDateStr(dateStr: string, startDay: number, keysSet: Set<string>): string | null {
  const k = getPeriodKey(parseLocalISODate(dateStr), startDay)
  return keysSet.has(k) ? k : null
}

/**
 * صفوف جدول إحصاءات العام: ١٢ فترة متتالية + يمكن للواجهة إضافة صف إجمالي.
 */
export async function fetchYearStatisticsRows(
  supabase: Supabase,
  userId: string,
  referencePeriodKey: string,
  startDay: number,
  fiscalStartMonth: number
): Promise<YearStatisticsRow[]> {
  const periodKeys = getFiscalYearPeriodKeys(referencePeriodKey, startDay, fiscalStartMonth)
  const keysSet = new Set(periodKeys)

  const first = getPeriodDates(periodKeys[0], startDay)
  const last = getPeriodDates(periodKeys[periodKeys.length - 1], startDay)
  const rangeStart = dateToLocalISODate(first.start)
  const rangeEnd = dateToLocalISODate(last.end)

  const buckets = new Map<string, ReturnType<typeof emptyBucket>>()
  for (const k of periodKeys) {
    buckets.set(k, emptyBucket())
  }

  const [inRes, outRes, savRes, invTxRes, invDealsRes] = await Promise.all([
    supabase.from('inflows').select('amount, date').eq('user_id', userId).gte('date', rangeStart).lte('date', rangeEnd),
    supabase
      .from('outflows')
      // لا نطلب obligation_id — قد يكون العمود غير موجود إن لم تُطبَّق هجرة 002؛
      // التصنيف يعتمد على name_ar/name_en وعلامة [[planora-obl:uuid]] عند الحاجة.
      .select('amount, status, date, name_ar, name_en')
      .eq('user_id', userId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
    supabase.from('savings_transactions').select('amount, type, date').eq('user_id', userId).gte('date', rangeStart).lte('date', rangeEnd),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('investment_wallet_transactions')
      .select('amount, type, date')
      .eq('user_id', userId)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
    supabase
      .from('investments')
      .select('entry_amount, exit_amount, exit_date, status')
      .eq('user_id', userId)
      .eq('status', 'closed'),
  ])

  if (inRes.error) throw new Error(inRes.error.message)
  if (outRes.error) throw new Error(outRes.error.message)
  if (savRes.error) throw new Error(savRes.error.message)
  if (invDealsRes.error) throw new Error(invDealsRes.error.message)
  if (invTxRes.error) throw new Error(invTxRes.error.message)

  for (const r of (inRes.data ?? []) as { amount: number; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    buckets.get(bk)!.income += Number(r.amount)
  }

  for (const r of (outRes.data ?? []) as {
    amount: number
    status: string
    date: string
    name_ar?: string | null
    name_en?: string | null
  }[]) {
    if (r.status !== 'paid') continue
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    const a = Number(r.amount)
    if (outflowIsObligationLinkedExpense(r)) b.obligationPaymentsPaid += a
    else b.generalExpensesPaid += a
  }

  for (const r of (savRes.data ?? []) as { amount: number; type: string; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    const a = Number(r.amount)
    if (r.type === 'deposit') b.savDeposit += a
    else b.savWithdrawal += a
  }

  for (const r of (invTxRes.data ?? []) as { amount: number; type: string; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    const a = Number(r.amount)
    if (r.type === 'deposit') b.invDeposit += a
    else if (r.type === 'withdrawal') b.invWithdrawal += a
  }

  for (const r of (invDealsRes.data ?? []) as {
    entry_amount: number
    exit_amount: number | null
    exit_date: string | null
  }[]) {
    if (!r.exit_date || r.exit_amount == null) continue
    const bk = bucketForDateStr(r.exit_date, startDay, keysSet)
    if (!bk) continue
    buckets.get(bk)!.invRealizedProfit += Number(r.exit_amount) - Number(r.entry_amount)
  }

  return periodKeys.map((periodKey) => ({
    periodKey,
    ...buckets.get(periodKey)!,
  }))
}

export function sumYearStatisticsRows(rows: YearStatisticsRow[]): YearStatisticsRow {
  return rows.reduce(
    (acc, r) => ({
      periodKey: '',
      income: acc.income + r.income,
      generalExpensesPaid: acc.generalExpensesPaid + r.generalExpensesPaid,
      obligationPaymentsPaid: acc.obligationPaymentsPaid + r.obligationPaymentsPaid,
      invDeposit: acc.invDeposit + r.invDeposit,
      invWithdrawal: acc.invWithdrawal + r.invWithdrawal,
      invRealizedProfit: acc.invRealizedProfit + r.invRealizedProfit,
      savDeposit: acc.savDeposit + r.savDeposit,
      savWithdrawal: acc.savWithdrawal + r.savWithdrawal,
    }),
    {
      periodKey: '',
      income: 0,
      generalExpensesPaid: 0,
      obligationPaymentsPaid: 0,
      invDeposit: 0,
      invWithdrawal: 0,
      invRealizedProfit: 0,
      savDeposit: 0,
      savWithdrawal: 0,
    }
  )
}
