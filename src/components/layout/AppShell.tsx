'use client'

import { MobileNavProvider, useMobileNav } from '@/contexts/MobileNavContext'
import { Sidebar } from '@/components/layout/Sidebar'
import type { ReactNode } from 'react'

function AppShellLayout({ children }: { children: ReactNode }) {
  const { isMobileMenuOpen, closeMobileMenu } = useMobileNav()

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={isMobileMenuOpen} onCloseMobile={closeMobileMenu} />
      <main className="min-w-0 flex-1 overflow-auto bg-[#F6F8FD]">{children}</main>
    </div>
  )
}

/** غلاف التطبيق: سياق القائمة الجوالية + Sidebar + main */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MobileNavProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </MobileNavProvider>
  )
}
