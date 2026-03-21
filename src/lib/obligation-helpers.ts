/**
 * دعم مخطط 001 (status) ومخطط 002 (paid_amount)
 * + سداد جزئي بدون عمود paid_amount عبر تتبع مصروفات تحمل العلامة [[planora-obl:uuid]]
 */

export type ObligationLike = {
  id?: string
  amount: number
  paid_amount?: number | null
  paidAmount?: number | null
  status?: 'paid' | 'pending' | null
}

export const OBLIGATION_PAY_TAG = (obligationId: string) => `[[planora-obl:${obligationId}]]`

/** مجموع مصروفات السداد المرتبطة بالالتزام (مخطط بدون paid_amount) */
export function sumLegacyMarkerPayments(
  outflows: Array<{ amount: number; name_ar?: string | null; name_en?: string | null }>,
  obligationId: string
): number {
  const tag = OBLIGATION_PAY_TAG(obligationId)
  let s = 0
  for (const o of outflows) {
    const ar = o.name_ar ?? ''
    const en = o.name_en ?? ''
    if (ar.includes(tag) || en.includes(tag)) s += Number(o.amount)
  }
  return s
}

/** مصروف مرتبط بسداد التزام: obligation_id أو علامة [[planora-obl:uuid]] في الاسم */
export function outflowIsObligationLinkedExpense(row: {
  obligation_id?: string | null
  name_ar?: string | null
  name_en?: string | null
}): boolean {
  const oid = row.obligation_id
  if (oid != null && String(oid).trim() !== '') return true
  const hay = `${row.name_ar ?? ''}\n${row.name_en ?? ''}`
  return /\[\[planora-obl:[a-f0-9-]{36}\]\]/i.test(hay)
}

function hasPaidAmountKey(row: ObligationLike): boolean {
  const r = row as unknown as Record<string, unknown>
  return Object.prototype.hasOwnProperty.call(r, 'paid_amount')
}

function rawPaidColumn(row: ObligationLike): number | undefined {
  if (!hasPaidAmountKey(row)) return undefined
  const v = row.paid_amount
  if (v == null || Number.isNaN(Number(v))) return 0
  return Number(v)
}

/**
 * المبلغ المسدَّد: عمود paid_amount إن وُجد، وإلا مجموع مصروفات العلامة، وإلا سداد كامل قديم (status=paid).
 */
export function obligationPaidAmount(row: ObligationLike, legacyMarkerPaidSum = 0): number {
  const col = rawPaidColumn(row)
  if (col !== undefined) return col
  if (row.status === 'paid' && legacyMarkerPaidSum < 0.0001) return Number(row.amount)
  return legacyMarkerPaidSum
}

export function obligationRemaining(row: ObligationLike, legacyMarkerPaidSum = 0): number {
  return Math.max(0, Number(row.amount) - obligationPaidAmount(row, legacyMarkerPaidSum))
}

/** السداد الجزئي متاح دائماً في الواجهة؛ التخزين يختار عمود القاعدة أو العلامة */
export function obligationSupportsPartialPay(_row?: ObligationLike | Record<string, unknown>): boolean {
  return true
}

export function obligationUsesPaidAmountColumn(row: ObligationLike): boolean {
  return hasPaidAmountKey(row)
}
