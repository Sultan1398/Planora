import type { LucideIcon } from 'lucide-react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Sprout,
  LineChart,
  Settings,
} from 'lucide-react'

export type NavAccent = {
  icon: string
  iconActive: string
  bgActive: string
  textActive: string
  ringActive: string
}

export type AppNavItem = {
  href: string
  icon: LucideIcon
  labelAr: string
  labelEn: string
  accent: NavAccent
}

/** نفس ترتيب الشريط الجانبي — للعناوين والأيقونات */
export const appNavItems: AppNavItem[] = [
  {
    href: '/hub',
    icon: Wallet,
    labelAr: 'المحفظة',
    labelEn: 'Hub',
    accent: {
      icon: 'text-sky-600',
      iconActive: 'text-sky-700',
      bgActive: 'bg-sky-50',
      textActive: 'text-sky-950',
      ringActive: 'ring-sky-200/80',
    },
  },
  {
    href: '/inflow',
    icon: TrendingUp,
    labelAr: 'الدخل',
    labelEn: 'Inflow',
    accent: {
      icon: 'text-emerald-600',
      iconActive: 'text-emerald-700',
      bgActive: 'bg-emerald-50',
      textActive: 'text-emerald-950',
      ringActive: 'ring-emerald-200/80',
    },
  },
  {
    href: '/outflow',
    icon: TrendingDown,
    labelAr: 'المصروف',
    labelEn: 'Outflow',
    accent: {
      icon: 'text-rose-600',
      iconActive: 'text-rose-700',
      bgActive: 'bg-rose-50',
      textActive: 'text-rose-950',
      ringActive: 'ring-rose-200/80',
    },
  },
  {
    href: '/growth',
    icon: Sprout,
    labelAr: 'النمو',
    labelEn: 'Growth',
    accent: {
      icon: 'text-teal-600',
      iconActive: 'text-teal-700',
      bgActive: 'bg-teal-50',
      textActive: 'text-teal-950',
      ringActive: 'ring-teal-200/80',
    },
  },
  {
    href: '/investments',
    icon: LineChart,
    labelAr: 'الاستثمارات',
    labelEn: 'Investments',
    accent: {
      icon: 'text-violet-600',
      iconActive: 'text-violet-700',
      bgActive: 'bg-violet-50',
      textActive: 'text-violet-950',
      ringActive: 'ring-violet-200/80',
    },
  },
  {
    href: '/settings',
    icon: Settings,
    labelAr: 'الإعدادات',
    labelEn: 'Settings',
    accent: {
      icon: 'text-slate-600',
      iconActive: 'text-slate-800',
      bgActive: 'bg-slate-100',
      textActive: 'text-slate-900',
      ringActive: 'ring-slate-200/80',
    },
  },
]

export function getAppNavItem(href: string): AppNavItem {
  const item = appNavItems.find((i) => i.href === href)
  if (!item) {
    throw new Error(`Unknown app nav href: ${href}`)
  }
  return item
}
