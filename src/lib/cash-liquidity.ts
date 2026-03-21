import { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>

/**
 * السيولة المتاحة في الفترة =
 * الدخل − المصروفات المدفوعة − (إيداعات المدخرات − سحوبات المدخرات)
 * أي: الإيداع في المدخرات يقلّل السيولة، والسحب يعيدها للمحفظة.
 */
export async function computeAvailableCash(
  supabase: Supabase,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const [inRes, outRes, savRes, invRes] = await Promise.all([
    supabase.from('inflows').select('amount').eq('user_id', userId).gte('date', periodStart).lte('date', periodEnd),
    supabase
      .from('outflows')
      .select('amount, status')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabase
      .from('savings_transactions')
      .select('amount, type')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    // تحويلات بين المحفظة والمحفظة الداخلية في قسم الاستثمارات (لا تشمل فتح/إغلاق الصفقة)
    (supabase as any)
      .from('investment_wallet_transactions')
      .select('amount, type')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .in('type', ['deposit', 'withdrawal']),
  ])

  if (inRes.error) throw new Error(inRes.error.message)
  if (outRes.error) throw new Error(outRes.error.message)
  if (savRes.error) throw new Error(savRes.error.message)

  let income = 0
  for (const r of inRes.data ?? []) income += Number((r as { amount: number }).amount)

  let paidOut = 0
  for (const r of outRes.data ?? []) {
    const row = r as { amount: number; status: string }
    if (row.status === 'paid') paidOut += Number(row.amount)
  }

  /** صافي خرج إلى المدخرات في الفترة: إيداع − سحب */
  let savingsNetOut = 0
  for (const r of savRes.data ?? []) {
    const row = r as { amount: number; type: string }
    const a = Number(row.amount)
    if (row.type === 'deposit') savingsNetOut += a
    else savingsNetOut -= a
  }

  /** صافي خرج إلى الاستثمارات في الفترة: إيداع − سحب */
  let investmentNetOut = 0
  if (!invRes?.error) {
    for (const r of invRes.data ?? []) {
      const row = r as { amount: number; type: string }
      const a = Number(row.amount)
      if (row.type === 'deposit') investmentNetOut += a
      else investmentNetOut -= a
    }
  }

  return income - paidOut - savingsNetOut - investmentNetOut
}

/**
 * سيولة تُحسب كما فوق لكن تستثني صف مصروف واحد (للتعديل).
 */
export async function computeAvailableCashExcludingOutflow(
  supabase: Supabase,
  userId: string,
  periodStart: string,
  periodEnd: string,
  excludeOutflowId: string
): Promise<number> {
  const [inRes, outRes, savRes, invRes] = await Promise.all([
    supabase.from('inflows').select('amount').eq('user_id', userId).gte('date', periodStart).lte('date', periodEnd),
    supabase
      .from('outflows')
      .select('id, amount, status')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabase
      .from('savings_transactions')
      .select('amount, type')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    (supabase as any)
      .from('investment_wallet_transactions')
      .select('amount, type')
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .in('type', ['deposit', 'withdrawal']),
  ])

  if (inRes.error) throw new Error(inRes.error.message)
  if (outRes.error) throw new Error(outRes.error.message)
  if (savRes.error) throw new Error(savRes.error.message)

  let income = 0
  for (const r of inRes.data ?? []) income += Number((r as { amount: number }).amount)

  let paidOut = 0
  for (const r of outRes.data ?? []) {
    const row = r as { id: string; amount: number; status: string }
    if (row.id === excludeOutflowId) continue
    if (row.status === 'paid') paidOut += Number(row.amount)
  }

  let savingsNetOut = 0
  for (const r of savRes.data ?? []) {
    const row = r as { amount: number; type: string }
    const a = Number(row.amount)
    if (row.type === 'deposit') savingsNetOut += a
    else savingsNetOut -= a
  }

  let investmentNetOut = 0
  if (!invRes?.error) {
    for (const r of invRes.data ?? []) {
      const row = r as { amount: number; type: string }
      const a = Number(row.amount)
      if (row.type === 'deposit') investmentNetOut += a
      else investmentNetOut -= a
    }
  }

  return income - paidOut - savingsNetOut - investmentNetOut
}

/**
 * سيولة «حالية» بدون فلترة حسب الفترة.
 * تُستخدم فقط في قسم الاستثمارات عندما نحتاج فحص الرصيد الحالي كشرط.
 */
export async function computeWalletCashNow(supabase: Supabase, userId: string): Promise<number> {
  const [inRes, outRes, savRes, invRes] = await Promise.all([
    supabase.from('inflows').select('amount').eq('user_id', userId),
    supabase.from('outflows').select('amount, status').eq('user_id', userId),
    supabase.from('savings_transactions').select('amount, type').eq('user_id', userId),
    (supabase as any)
      .from('investment_wallet_transactions')
      .select('amount, type')
      .eq('user_id', userId)
      .in('type', ['deposit', 'withdrawal']),
  ])

  if (inRes.error) throw new Error(inRes.error.message)
  if (outRes.error) throw new Error(outRes.error.message)
  if (savRes.error) throw new Error(savRes.error.message)

  let income = 0
  for (const r of inRes.data ?? []) income += Number((r as { amount: number }).amount)

  let paidOut = 0
  for (const r of outRes.data ?? []) {
    const row = r as { amount: number; status: string }
    if (row.status === 'paid') paidOut += Number(row.amount)
  }

  let savingsNetOut = 0
  for (const r of savRes.data ?? []) {
    const row = r as { amount: number; type: string }
    const a = Number(row.amount)
    if (row.type === 'deposit') savingsNetOut += a
    else savingsNetOut -= a
  }

  let investmentNetOut = 0
  if (!invRes?.error) {
    for (const r of invRes.data ?? []) {
      const row = r as { amount: number; type: string }
      const a = Number(row.amount)
      if (row.type === 'deposit') investmentNetOut += a
      else investmentNetOut -= a
    }
  }

  return income - paidOut - savingsNetOut - investmentNetOut
}
