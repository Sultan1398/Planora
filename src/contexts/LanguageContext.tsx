'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Locale = 'ar' | 'en'

interface LanguageContextValue {
  locale: Locale
  toggleLocale: () => void
  isRTL: boolean
  t: (ar: string, en: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ar')

  useEffect(() => {
    const saved = localStorage.getItem('planora-locale') as Locale | null
    if (saved === 'ar' || saved === 'en') setLocale(saved)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('planora-locale', locale)
  }, [locale])

  const toggleLocale = () => setLocale((prev) => (prev === 'ar' ? 'en' : 'ar'))

  const t = (ar: string, en: string) => (locale === 'ar' ? ar : en)

  return (
    <LanguageContext.Provider value={{ locale, toggleLocale, isRTL: locale === 'ar', t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
