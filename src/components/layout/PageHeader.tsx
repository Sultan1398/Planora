'use client'

import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import { useMobileNavOptional } from '@/contexts/MobileNavContext'
import type { AppNavItem } from '@/config/navigation'
import { Menu } from 'lucide-react'

type PageHeaderProps = {
  /** عنصر التنقل المطابق للقسم (أيقونة ولون كالشريط الجانبي) */
  nav: AppNavItem
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ nav, subtitle, actions }: PageHeaderProps) {
  const { t } = useLanguage()
  const mobileNav = useMobileNavOptional()
  const Icon = nav.icon
  const a = nav.accent

  return (
    <header className="relative -mx-4 px-4 mb-8 lg:-mx-6 lg:px-6">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl',
          'border border-slate-200/90 bg-white',
          'shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_40px_-16px_rgba(15,23,42,0.12)]',
          'ring-1 ring-slate-900/[0.04]'
        )}
      >
        {/* شريط لوني خفيف يعكس قسم الصفحة */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-1 rounded-t-2xl',
            'ltr:bg-gradient-to-r rtl:bg-gradient-to-l opacity-90',
            a.icon.includes('sky') && 'from-sky-400/80 via-sky-500/60 to-sky-400/30',
            a.icon.includes('emerald') && 'from-emerald-400/80 via-emerald-500/60 to-emerald-400/30',
            a.icon.includes('rose') && 'from-rose-400/80 via-rose-500/60 to-rose-400/30',
            a.icon.includes('amber') && 'from-amber-400/80 via-amber-500/60 to-amber-400/30',
            a.icon.includes('violet') && 'from-violet-400/80 via-violet-500/60 to-violet-400/30',
            a.icon.includes('indigo') && 'from-indigo-400/80 via-indigo-500/60 to-indigo-400/30',
            a.icon.includes('teal') && 'from-teal-400/80 via-teal-500/60 to-teal-400/30',
            a.icon.includes('slate') && 'from-slate-400/70 via-slate-500/50 to-slate-400/25'
          )}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_100%_-20%,var(--color-brand-light),transparent_55%)] opacity-40"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            {/* العنوان والأيقونة في سطر واحد */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {mobileNav ? (
                <button
                  type="button"
                  onClick={mobileNav.openMobileMenu}
                  className="-ms-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 shadow-sm transition-colors hover:bg-surface lg:hidden"
                  aria-label={t('فتح القائمة', 'Open menu')}
                >
                  <Menu className="h-6 w-6" strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                  'shadow-inner shadow-white/60 ring-1 ring-slate-900/[0.07]',
                  a.bgActive
                )}
              >
                <Icon
                  className={cn('h-[1.35rem] w-[1.35rem] sm:h-6 sm:w-6', a.icon)}
                  strokeWidth={2.35}
                  aria-hidden
                />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {t(nav.labelAr, nav.labelEn)}
              </h1>
            </div>
            {subtitle ? (
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted sm:text-[0.9375rem]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 lg:border-t-0 lg:border-s lg:border-slate-100 lg:ps-6 lg:pt-0">
              {actions}
            </div>
          ) : null}
        </div>
        {/* خط سفلي أوضح يحدد نهاية الرأس */}
        <div
          className="h-px ltr:bg-gradient-to-r rtl:bg-gradient-to-l from-transparent via-slate-200 to-transparent"
          aria-hidden
        />
      </div>
    </header>
  )
}
