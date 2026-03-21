import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { westernDecimal2 } from '@/lib/western-numerals'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number as currency.
 */
export function formatCurrency(
  amount: number,
  _locale: 'ar' | 'en' = 'en',
  currency = 'SAR'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formats a number with thousand separators.
 */
export function formatNumber(amount: number, _locale: 'ar' | 'en' = 'en'): string {
  return westernDecimal2.format(amount)
}
