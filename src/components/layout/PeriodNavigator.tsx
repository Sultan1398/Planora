'use client'

import { usePeriod } from '@/contexts/PeriodContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PeriodNavigator() {
  const {
    periodStartLabel,
    periodEndLabel,
    fiscalPeriodNumber,
    goNext,
    goPrev,
    goToCurrent,
    isCurrentPeriod,
  } = usePeriod()
  const { t, isRTL } = useLanguage()
  const periodRangeForA11y = `${periodStartLabel} — ${periodEndLabel}`

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft
  const NextIcon = isRTL ? ChevronLeft : ChevronRight

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goPrev}
        className="p-1.5 rounded-lg hover:bg-surface border border-border transition-colors"
        aria-label={t('الفترة السابقة', 'Previous period')}
      >
        <PrevIcon size={16} className="text-muted" />
      </button>

      {/* رقم الفترة فقط — التواريخ مخفية؛ الوصف للقارئ الشاشة وعند التمرير */}
      <div
        className="flex items-center [unicode-bidi:isolate]"
        dir="ltr"
        title={periodRangeForA11y}
        aria-label={
          fiscalPeriodNumber != null
            ? t(
                `الفترة ${fiscalPeriodNumber}، ${periodStartLabel} إلى ${periodEndLabel}`,
                `Period ${fiscalPeriodNumber}, ${periodStartLabel} to ${periodEndLabel}`
              )
            : periodRangeForA11y
        }
      >
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            'bg-brand text-white text-sm font-bold tabular-nums shadow-md',
            'ring-2 ring-white/30 ring-inset',
            'hover:bg-brand-dark transition-colors'
          )}
        >
          {fiscalPeriodNumber != null ? fiscalPeriodNumber : '—'}
        </span>
      </div>

      {!isCurrentPeriod && (
        <button
          onClick={goToCurrent}
          className="text-xs bg-brand/10 text-brand hover:bg-brand/20 px-2 py-0.5 rounded-md transition-colors"
        >
          {t('الحالية', 'Now')}
        </button>
      )}

      <button
        onClick={goNext}
        className="p-1.5 rounded-lg hover:bg-surface border border-border transition-colors"
        aria-label={t('الفترة التالية', 'Next period')}
      >
        <NextIcon size={16} className="text-muted" />
      </button>
    </div>
  )
}
