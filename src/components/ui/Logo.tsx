'use client'

import Image from 'next/image'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

interface LogoProps {
  /** sm: مدمج | md: الشريط الجانبي | lg: تسجيل الدخول | xl: ترحيب مع الاسم */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showName?: boolean
  className?: string
}

const sizes = {
  sm: {
    img: 40,
    text: 'text-lg font-semibold tracking-tight',
    gap: 'gap-2.5',
    rounded: 'rounded-xl',
    shadow: 'shadow-sm',
  },
  md: {
    img: 56,
    text: 'text-xl font-bold tracking-tight',
    gap: 'gap-3.5',
    rounded: 'rounded-2xl',
    shadow: 'shadow-md shadow-brand/10 ring-1 ring-black/[0.06]',
  },
  lg: {
    img: 104,
    text: 'text-2xl font-bold tracking-tight',
    gap: 'gap-4',
    rounded: 'rounded-2xl',
    shadow: 'shadow-lg shadow-brand/15 ring-1 ring-black/[0.08]',
  },
  xl: {
    img: 88,
    text: 'text-3xl font-bold tracking-tight',
    gap: 'gap-4',
    rounded: 'rounded-2xl',
    shadow: 'shadow-xl shadow-brand/20 ring-1 ring-black/[0.08]',
  },
}

export function Logo({ size = 'md', showName = true, className }: LogoProps) {
  const { locale } = useLanguage()
  const cfg = sizes[size]

  return (
    <div className={cn('flex items-center', cfg.gap, className)}>
      <div
        className={cn(
          'relative flex-shrink-0 overflow-hidden bg-white',
          cfg.rounded,
          cfg.shadow
        )}
        style={{ width: cfg.img, height: cfg.img }}
      >
        <Image
          src="/brand/planora-logo.png"
          alt={locale === 'ar' ? 'شعار بلانورا' : 'Planora logo'}
          width={cfg.img}
          height={cfg.img}
          className="h-full w-full object-contain p-[6%]"
          priority
          unoptimized
        />
      </div>
      {showName && (
        <span
          className={cn(
            'text-foreground leading-tight',
            cfg.text,
            locale === 'en' && 'tracking-tight'
          )}
        >
          {locale === 'ar' ? 'بلانورا' : 'Planora'}
        </span>
      )}
    </div>
  )
}

export function LogoIcon({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const { locale } = useLanguage()
  const cfg = sizes[size]
  return (
    <div
      className={cn(
        'relative flex-shrink-0 overflow-hidden bg-white',
        cfg.rounded,
        cfg.shadow
      )}
      style={{ width: cfg.img, height: cfg.img }}
    >
      <Image
        src="/brand/planora-logo.png"
        alt={locale === 'ar' ? 'شعار بلانورا' : 'Planora logo'}
        width={cfg.img}
        height={cfg.img}
        className="h-full w-full object-contain p-[6%]"
        priority
        unoptimized
      />
    </div>
  )
}
