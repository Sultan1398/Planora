import type { createClient } from '@/lib/supabase/client'
import { getPeriodDates } from '@/lib/period'
import { dateToLocalISODate } from '@/lib/date-local'

type Supabase = ReturnType<typeof createClient>

export type DeleteDataResult = { ok: true } | { ok: false; message: string }

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** حدود الفترة كـ YYYY-MM-DD شاملة الطرفين */
export function periodKeyToLocalDateRange(periodKey: string, startDay: number): { start: string; end: string } {
  const { start, end } = getPeriodDates(periodKey, startDay)
  return {
    start: dateToLocalISODate(start),
    end: dateToLocalISODate(end),
  }
}

/**
 * حذف كل السجلات المؤرخة داخل [start, end] للمستخدم الحالي.
 * الاستثمارات: تُحذف الصفقات التي تاريخ فتحها داخل الفترة فقط (لا تُحذف صفقات أُغلقت في الفترة وفُتحت قبلها).
 */
export async function deleteUserFinancialDataInPeriod(
  supabase: Supabase,
  userId: string,
  periodKey: string,
  startDay: number
): Promise<DeleteDataResult> {
  const { start, end } = periodKeyToLocalDateRange(periodKey, startDay)

  try {
    const { error: i1 } = await supabase
      .from('inflows')
      .delete()
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
    if (i1) return { ok: false, message: i1.message }

    const { error: i2 } = await supabase
      .from('outflows')
      .delete()
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
    if (i2) return { ok: false, message: i2.message }

    const { error: i3 } = await supabase
      .from('obligations')
      .delete()
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
    if (i3) return { ok: false, message: i3.message }

    const { error: i4 } = await supabase
      .from('savings_transactions')
      .delete()
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
    if (i4) return { ok: false, message: i4.message }

    const { error: i5 } = await supabase
      .from('investment_wallet_transactions')
      .delete()
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
    if (i5) return { ok: false, message: i5.message }

    const { error: i6 } = await supabase
      .from('investments')
      .delete()
      .eq('user_id', userId)
      .gte('entry_date', start)
      .lte('entry_date', end)
    if (i6) return { ok: false, message: i6.message }

    return { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e) }
  }
}

/**
 * حذف كل البيانات المالية للمستخدم (يُحتفظ بحساب المستخدم وإعدادات الملف الشخصي فقط).
 */
export async function deleteAllUserFinancialData(supabase: Supabase, userId: string): Promise<DeleteDataResult> {
  try {
    const tables = [
      'investment_wallet_transactions',
      'investments',
      'savings_transactions',
      'savings_goals',
      'inflows',
      'outflows',
      'obligations',
    ] as const

    for (const name of tables) {
      const { error } = await supabase.from(name).delete().eq('user_id', userId)
      if (error) return { ok: false, message: `${name}: ${error.message}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e) }
  }
}
