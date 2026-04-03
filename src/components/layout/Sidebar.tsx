'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'
import { Headphones, LogOut, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
import { appNavItems } from '@/config/navigation'
import { ContactSupportModal } from '@/components/layout/ContactSupportModal'
import { NotificationBell } from '@/components/layout/NotificationBell'

type SidebarProps = {
  mobileOpen: boolean
  onCloseMobile: () => void
}

function SidebarContent({
  onNavigate,
  showCloseButton,
  onClose,
  onOpenSupport,
}: {
  onNavigate: () => void
  showCloseButton: boolean
  onClose: () => void
  onOpenSupport: () => void
}) {
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
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-white px-5 py-6">
        <Logo size="md" showName />
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label={t('إغلاق القائمة', 'Close menu')}
          >
            <X size={22} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="px-2.5 pb-2 pt-1">
        <div
          className={cn(
            'relative overflow-visible rounded-2xl border border-slate-200/90',
            'bg-gradient-to-br from-white via-slate-50/50 to-brand/[0.07]',
            'p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/[0.04]'
          )}
        >
          <div
            className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-l from-transparent via-brand/35 to-transparent opacity-90"
            aria-hidden
          />
          <NotificationBell
            sidebarMode
            sidebarLeading={
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold tracking-tight text-slate-900">
                  {t('التنبيهات', 'Notifications')}
                </p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500">
                  {t('مواعيد الالتزامات والمتابعة', 'Obligation due dates & follow-up')}
                </p>
              </div>
            }
          />
        </div>
      </div>

      <nav className="space-y-0.5 p-2.5 pt-0">
        {appNavItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          const a = item.accent
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
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

      <div className="space-y-1 border-t border-border bg-white p-2.5 pt-2">
        <button
          type="button"
          onClick={() => {
            onOpenSupport()
          }}
          className={cn(
            'group/support flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-bold transition-all',
            'text-slate-800 hover:bg-brand/10 hover:text-brand'
          )}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 group-hover/support:bg-white">
            <Headphones
              size={20}
              className="text-brand transition-colors"
              strokeWidth={2.1}
              aria-hidden
            />
          </span>
          <span>{t('التواصل مع الدعم', 'Contact support')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSignOut()
          }}
          className={cn(
            'group/signout flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-bold transition-all',
            'text-slate-800 hover:bg-danger/10 hover:text-danger'
          )}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 group-hover/signout:bg-white">
            <LogOut
              size={20}
              className="text-danger transition-colors group-hover/signout:text-danger"
              strokeWidth={2.1}
            />
          </span>
          <span>{t('تسجيل الخروج', 'Sign Out')}</span>
        </button>
      </div>
    </>
  )
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useLanguage()
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportToast, setSupportToast] = useState(false)

  const closeDrawer = () => onCloseMobile()

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  return (
    <>
      <ContactSupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        onSuccess={() => {
          setSupportToast(true)
          window.setTimeout(() => setSupportToast(false), 5000)
        }}
      />
      {supportToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[70] w-[min(100%,24rem)] -translate-x-1/2 px-4"
          role="status"
        >
          <div
            className={cn(
              'rounded-xl border border-emerald-200 bg-white px-4 py-3 text-center text-sm font-semibold text-success shadow-lg',
              'ring-1 ring-black/[0.04]'
            )}
          >
            {t('تم إرسال رسالتك بنجاح.', 'Your message was sent successfully.')}
          </div>
        </div>
      ) : null}

      {/* سطح المكتب */}
      <aside className="hidden w-[17rem] min-h-screen flex-col border-e border-border bg-white lg:flex">
        <SidebarContent
          onNavigate={() => {}}
          showCloseButton={false}
          onClose={closeDrawer}
          onOpenSupport={() => setSupportOpen(true)}
        />
      </aside>

      {/* جوال: خلفية + درج */}
      {mobileOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
            aria-label={t('إغلاق القائمة', 'Close menu')}
            onClick={closeDrawer}
          />
          <aside
            className={cn(
              'fixed inset-y-0 z-50 flex w-[17rem] max-w-[min(17rem,100vw)] flex-col bg-white shadow-xl',
              'border-e border-border lg:hidden start-0'
            )}
            role="dialog"
            aria-modal="true"
            aria-label={t('القائمة الرئيسية', 'Main menu')}
          >
            <SidebarContent
              onNavigate={closeDrawer}
              showCloseButton
              onClose={closeDrawer}
              onOpenSupport={() => setSupportOpen(true)}
            />
          </aside>
        </>
      ) : null}
    </>
  )
}
