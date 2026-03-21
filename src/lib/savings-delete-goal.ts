import { createClient } from '@/lib/supabase/client'

type AppSupabase = ReturnType<typeof createClient>

/**
 * حذف هدف المدخرات مع حذف معاملاته بالترتيب العكسي حتى تعكس الـ trigger
 * أرصدة الهدف بشكل صحيح، ثم يُحذف الهدف. يُعاد المبلغ «للمحفظة» عبر إزالة
 * إيداعات/سحوبات الفترات من حساب السيولة (انظر computeAvailableCash).
 */
export async function deleteSavingsGoalWithOrderedTxRemoval(
  supabase: AppSupabase,
  goalId: string
): Promise<{ error: Error | null }> {
  const { data: txs, error: qErr } = await supabase
    .from('savings_transactions')
    .select('id')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })

  if (qErr) return { error: new Error(qErr.message) }

  for (const tx of txs ?? []) {
    const { error: dErr } = await supabase.from('savings_transactions').delete().eq('id', tx.id)
    if (dErr) return { error: new Error(dErr.message) }
  }

  const { error: gErr } = await supabase.from('savings_goals').delete().eq('id', goalId)
  if (gErr) return { error: new Error(gErr.message) }

  return { error: null }
}
