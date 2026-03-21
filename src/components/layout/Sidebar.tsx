'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { appNavItems } from '@/config/navigation'

export function Sidebar() {
  const { t } = useLanguage()
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[17rem] min-h-screen flex flex-col bg-white border-e border-border">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border bg-white">
        <Logo size="md" showName />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2.5">
        {appNavItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          const a = item.accent
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-xl text-[14px] font-bold transition-all duration-200',
                isActive
                  ? cn(a.bgActive, a.textActive, 'shadow-sm ring-1', a.ringActive)
                  : cn('text-slate-800', 'hover:bg-slate-50 hover:shadow-sm')
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                  isActive ? 'bg-white/80 shadow-sm' : 'bg-slate-50 group-hover:bg-white'
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.35 : 2.1}
                  className={cn('transition-colors', isActive ? a.iconActive : a.icon)}
                />
              </span>
              <span className="leading-snug">{t(item.labelAr, item.labelEn)}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="space-y-1 border-t border-border bg-white p-2.5 pt-2">
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            'group/signout flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-bold transition-all',
            'text-slate-800 hover:bg-red-50 hover:text-red-700'
          )}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 group-hover/signout:bg-white">
            <LogOut
              size={20}
              className="text-red-600 transition-colors group-hover/signout:text-red-700"
              strokeWidth={2.1}
            />
          </span>
          <span>{t('تسجيل الخروج', 'Sign Out')}</span>
        </button>
      </div>
    </aside>
  )
}
