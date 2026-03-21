import { createClient } from '@/lib/supabase/client'

type Supabase = ReturnType<typeof createClient>

/** صافي رصيد محفظة الاستثمارات الداخلية الآن (بدون فلترة تواريخ). */
export async function computeInvestmentInternalBalance(supabase: Supabase, userId: string): Promise<number> {
  const invRes = await (supabase as any).from('investment_wallet_transactions').select('amount, type').eq('user_id', userId)

  if (invRes.error) return 0

  let bal = 0
  for (const r of invRes.data ?? []) {
    const row = r as { amount: number; type: string }
    const a = Number(row.amount)
    if (row.type === 'deposit') bal += a
    else if (row.type === 'deal_close') bal += a
    else if (row.type === 'withdrawal') bal -= a
    else if (row.type === 'deal_open') bal -= a
  }
  return bal
}

export type InvestmentOpenTx = {
  id: string
  amount: number
  date: string
} | null

export async function getInvestmentDealOpenTx(
  supabase: Supabase,
  userId: string,
  investmentId: string
): Promise<InvestmentOpenTx> {
  const res = await (supabase as any)
    .from('investment_wallet_transactions')
    .select('id, amount, date')
    .eq('user_id', userId)
    .eq('investment_id', investmentId)
    .eq('type', 'deal_open')
    .maybeSingle()

  if (res.error) return null
  if (!res.data) return null
  return res.data as InvestmentOpenTx
}

