import type { Metadata } from 'next'
import { Almarai, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/contexts/LanguageContext'

const almarai = Almarai({
  weight: ['300', '400', '700', '800'],
  subsets: ['arabic', 'latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Planora — Personal Finance Flow',
  description: 'Track your income, expenses, savings, and investments across dynamic financial periods.',
  icons: {
    icon: '/brand/planora-logo.png',
    apple: '/brand/planora-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${almarai.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body
        className={`min-h-full flex flex-col bg-background text-foreground ${almarai.className}`}
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
