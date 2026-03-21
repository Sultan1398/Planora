'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type MobileNavContextValue = {
  openMobileMenu: () => void
  closeMobileMenu: () => void
  isMobileMenuOpen: boolean
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null)

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), [])
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  const value = useMemo(
    () => ({
      openMobileMenu,
      closeMobileMenu,
      isMobileMenuOpen,
    }),
    [openMobileMenu, closeMobileMenu, isMobileMenuOpen]
  )

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
}

/** داخل `MobileNavProvider` فقط */
export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext)
  if (!ctx) {
    throw new Error('useMobileNav must be used within MobileNavProvider')
  }
  return ctx
}

/** يعيد `null` خارج المزوّد — لـ PageHeader وغيره */
export function useMobileNavOptional() {
  return useContext(MobileNavContext)
}
