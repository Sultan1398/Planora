import { westernDecimal2 } from '@/lib/western-numerals'

/** مبالغ بأرقام لاتينية دائماً؛ المعامل locale للتوافق مع الاستدعاءات فقط */
export function formatMoney(amount: number, _locale?: 'ar' | 'en'): string {
  return westernDecimal2.format(amount)
}
