import { createClient } from '@/lib/supabase/client'
import { getPeriodDates, getPeriodKey, getFiscalYearPeriodKeys } from '@/lib/period'
import { dateToLocalISODate, parseLocalISODate } from '@/lib/date-local'

type Supabase = ReturnType<typeof createClient>

/** نقطة بيانات لفترة واحدة ضمن تحليل السنة (12 فترة) */
export type DashboardPeriodPoint = {
  periodKey: string
  /** رقم الفترة ضمن السنة المالية 1–12 */
  periodNumber: number
  /** تسمية قصيرة للمحور (مثلاً Mar 26) */
  label: string
  income: number
  /** إجمالي ما دُفع من المحفظة (مصروفات مدفوعة + التزامات) */
  expensesPaid: number
  /** صافي المدخرات: إيداع − سحب */
  savingsNet: number
  /** صافي تحويلات محفظة الاستثمارات: إيداع − سحب (بدون فتح/إغلاق الصفقة) */
  investmentsTransferNet: number
  /** سيولة الفترة ≈ الدخل − المدفوع − المدخرات − تحويلات الاستثمار */
  liquidityNet: number
  invDeposit: number
  invWithdrawal: number
  invDealOpen: number
  invDealClose: number
  /** ربح/خسارة محققة من صفقات أُغلقت في هذه الفترة (حسب exit_date) */
  invRealizedPL: number
}

function monthAbbrevFromKey(key: string): string {
  const [, m] = key.split('-')
  const idx = Math.max(0, Math.min(11, parseInt(m, 10) - 1))
  const abbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][idx]
  return abbr
}

function shortPeriodLabel(key: string): string {
  const [y] = key.split('-')
  return `${monthAbbrevFromKey(key)} '${y.slice(2)}`
}

function emptyBucket(): Omit<DashboardPeriodPoint, 'periodKey' | 'label' | 'periodNumber'> {
  return {
    income: 0,
    expensesPaid: 0,
    savingsNet: 0,
    investmentsTransferNet: 0,
    liquidityNet: 0,
    invDeposit: 0,
    invWithdrawal: 0,
    invDealOpen: 0,
    invDealClose: 0,
    invRealizedPL: 0,
  }
}

function bucketForDateStr(dateStr: string, startDay: number, keysSet: Set<string>): string | null {
  const k = getPeriodKey(parseLocalISODate(dateStr), startDay)
  return keysSet.has(k) ? k : null
}

/**
 * يجلب ويجمع بيانات 12 فترة متتالية بدءًا من شهر المفتاح المرجعي.
 */
export async function fetchDashboardYearSeries(
  supabase: Supabase,
  userId: string,
  referencePeriodKey: string,
  startDay: number,
  fiscalStartMonth: number
): Promise<DashboardPeriodPoint[]> {
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
    supabase.from('outflows').select('amount, status, date').eq('user_id', userId).gte('date', rangeStart).lte('date', rangeEnd),
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

  const invTxData = invTxRes as { data: unknown; error: { message: string } | null }
  if (invTxData.error) throw new Error(invTxData.error.message)

  for (const r of (inRes.data ?? []) as { amount: number; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    b.income += Number(r.amount)
  }

  for (const r of (outRes.data ?? []) as { amount: number; status: string; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    if (r.status !== 'paid') continue
    const b = buckets.get(bk)!
    b.expensesPaid += Number(r.amount)
  }

  for (const r of (savRes.data ?? []) as { amount: number; type: string; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    const a = Number(r.amount)
    if (r.type === 'deposit') b.savingsNet += a
    else b.savingsNet -= a
  }

  for (const r of (invTxData.data ?? []) as { amount: number; type: string; date: string }[]) {
    const bk = bucketForDateStr(r.date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    const a = Number(r.amount)
    const t = r.type
    if (t === 'deposit') {
      b.invDeposit += a
      b.investmentsTransferNet += a
    } else if (t === 'withdrawal') {
      b.invWithdrawal += a
      b.investmentsTransferNet -= a
    } else if (t === 'deal_open') {
      b.invDealOpen += a
    } else if (t === 'deal_close') {
      b.invDealClose += a
    }
  }

  for (const r of (invDealsRes.data ?? []) as {
    entry_amount: number
    exit_amount: number | null
    exit_date: string | null
  }[]) {
    if (!r.exit_date || r.exit_amount == null) continue
    const bk = bucketForDateStr(r.exit_date, startDay, keysSet)
    if (!bk) continue
    const b = buckets.get(bk)!
    b.invRealizedPL += Number(r.exit_amount) - Number(r.entry_amount)
  }

  const series: DashboardPeriodPoint[] = periodKeys.map((key, index) => {
    const b = buckets.get(key)!
    const liquidityNet = b.income - b.expensesPaid - b.savingsNet - b.investmentsTransferNet
    const periodNumber = index + 1
    return {
      periodKey: key,
      periodNumber,
      label: `${periodNumber} · ${shortPeriodLabel(key)}`,
      income: b.income,
      expensesPaid: b.expensesPaid,
      savingsNet: b.savingsNet,
      investmentsTransferNet: b.investmentsTransferNet,
      liquidityNet,
      invDeposit: b.invDeposit,
      invWithdrawal: b.invWithdrawal,
      invDealOpen: b.invDealOpen,
      invDealClose: b.invDealClose,
      invRealizedPL: b.invRealizedPL,
    }
  })

  return series
}

export function sumDashboardYear(points: DashboardPeriodPoint[]) {
  return points.reduce(
    (acc, p) => ({
      income: acc.income + p.income,
      expensesPaid: acc.expensesPaid + p.expensesPaid,
      savingsNet: acc.savingsNet + p.savingsNet,
      investmentsTransferNet: acc.investmentsTransferNet + p.investmentsTransferNet,
      liquidityNet: acc.liquidityNet + p.liquidityNet,
      invDeposit: acc.invDeposit + p.invDeposit,
      invWithdrawal: acc.invWithdrawal + p.invWithdrawal,
      invDealOpen: acc.invDealOpen + p.invDealOpen,
      invDealClose: acc.invDealClose + p.invDealClose,
      invRealizedPL: acc.invRealizedPL + p.invRealizedPL,
    }),
    {
      income: 0,
      expensesPaid: 0,
      savingsNet: 0,
      investmentsTransferNet: 0,
      liquidityNet: 0,
      invDeposit: 0,
      invWithdrawal: 0,
      invDealOpen: 0,
      invDealClose: 0,
      invRealizedPL: 0,
    }
  )
}
