'use client'

import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Navbar } from '@/components/Navbar'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

interface Subsection {
  subHeading: string
  bullets?: string[]
  text?: string
}

interface Feature {
  title: string
  desc: string
}

interface Section {
  id: string
  heading: string
  text: string
  subsections?: Subsection[]
  features?: Feature[]
}

interface ContentLocale {
  title: string
  sections: Section[]
}

interface Content {
  ar: ContentLocale
  en: ContentLocale
}

const content: Content = {
  ar: {
    title: 'كيف يعمل بلانورا؟',
    sections: [
      {
        id: 'goal',
        heading: 'الهدف من بلانورا',
        text: 'لا يكتفي بلانورا بكونه أداة لتسجيل عملياتك المالية، بل يذهب أبعد من ذلك. فلسفة بلانورا تقوم على مبدأ واحد: تبسيط إدارة أموالك حتى تستعيد السيطرة الكاملة عليها. نؤمن بأن الإدارة المالية الجيدة لا تعني تعقيداً أو جداول مرهقة، بل تعني وضوح الرؤية وسهولة التنفيذ — وهذا بالضبط ما يقدمه بلانورا.',
      },
      {
        id: 'periods',
        heading: 'الفترات المالية',
        text: "يرتكز بلانورا على مفهوم محوري يُميّزه: 'الفترات المالية'. وهي دورات زمنية منتظمة — شهرية في الغالب — تُشكل الإطار الزمني لتنظيم جميع معاملاتك المالية وتتبعها.",
        subsections: [
          {
            subHeading: 'لماذا الفترات المالية؟',
            bullets: [
              'ربط كل معاملة مالية بسياقها الزمني الصحيح.',
              'مقارنة الأداء المالي بين الفترات بدقة وموضوعية.',
              'ملخص سنوي متكامل يجمع ١٢ فترة في جدول واحد.',
              'رصد الاتجاهات المالية وتحليلها على المدى البعيد.',
            ],
          },
          {
            subHeading: 'كيفية إعداد الفترات المالية',
            text: 'من قسم الإعدادات، يمكنك تحديد يوم وشهر بداية فترتك المالية الأولى. ويُنصح باختيار تاريخ استلام راتبك الشهري إن كان ثابتاً — إذ يُمثل هذا التاريخ بداية دورة مالية منطقية وطبيعية لك. وبمجرد تحديد هذا التاريخ، يُعيد بلانورا جدولة نفسه تلقائياً ليبدأ كل فترة في اليوم ذاته من كل شهر.',
          },
        ],
      },
      {
        id: 'app-sections',
        heading: 'أقسام التطبيق',
        text: 'يتكون بلانورا من ستة أقسام رئيسية، كل منها مصمم بعناية لتغطية جانب محدد من حياتك المالية:',
        features: [{ title: 'المحفظة', desc: 'نظرة لحظية شاملة على وضعك المالي الكامل.' }],
      },
    ],
  },
  en: {
    title: 'How Planura Works?',
    sections: [
      {
        id: 'goal',
        heading: 'The Goal of Planura',
        text: 'Planura is not just a tool for recording your financial transactions; it goes much further. The philosophy of Planura is based on a single principle: simplifying the management of your money so you can regain full control over it. We believe that good financial management does not mean complexity or cumbersome spreadsheets, but rather clarity of vision and ease of execution—and this is exactly what Planura offers.',
      },
      {
        id: 'periods',
        heading: 'Financial Periods',
        text: "Planura is anchored by a core concept that sets it apart: 'Financial Periods'. These are regular time cycles—mostly monthly—that form the timeframe for organizing and tracking all your financial transactions.",
        subsections: [
          {
            subHeading: 'Why Financial Periods?',
            bullets: [
              'Connect each financial transaction to its correct chronological context.',
              'Compare financial performance between periods accurately and objectively.',
              'A comprehensive annual summary combining 12 periods in one table.',
              'Monitor and analyze financial trends over the long term.',
            ],
          },
          {
            subHeading: 'How to set up Financial Periods',
            text: 'From the settings section, you can select the day and month your first financial period begins. It is recommended to choose the date you receive your monthly salary if it is fixed—as this date represents a logical and natural financial cycle for you. Once this date is set, Planura automatically reschedules itself to start each period on the exact same day every month.',
          },
        ],
      },
      {
        id: 'app-sections',
        heading: 'App Sections',
        text: 'Planura consists of six main sections, each carefully designed to cover a specific aspect of your financial life:',
        features: [
          {
            title: 'Portfolio',
            desc: 'A comprehensive real-time overview of your complete financial situation.',
          },
        ],
      },
    ],
  },
}

type LocaleKey = keyof Content

export default function HowItWorksPage() {
  const { locale, t } = useLanguage()
  const lang: LocaleKey = locale === 'en' ? 'en' : 'ar'
  const c = content[lang]

  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50 text-slate-900">
      <Navbar />

      <main className="flex grow flex-col">
        <div
          className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-[5.5rem] sm:px-6 sm:pb-16 sm:pt-24"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <Link
            href="/"
            className={cn(
              'mb-8 inline-flex text-sm font-semibold text-brand transition-colors hover:text-brand-dark',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 rounded-lg'
            )}
          >
            {t('العودة للرئيسية', 'Back to Home')}
          </Link>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{c.title}</h1>

            <div className="mt-10 space-y-12 sm:space-y-14">
              {c.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 sm:scroll-mt-32">
                  <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{section.heading}</h2>
                  <p className="mt-4 text-base leading-relaxed text-slate-700">{section.text}</p>

                  {section.subsections?.map((sub) => (
                    <div key={sub.subHeading} className="mt-8 border-slate-100 border-s-4 ps-4 sm:ps-5">
                      <h3 className="text-lg font-semibold text-slate-900">{sub.subHeading}</h3>
                      {sub.bullets && sub.bullets.length > 0 && (
                        <ul className="mt-3 list-disc space-y-2 ps-5 text-base leading-relaxed text-slate-700">
                          {sub.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                      {sub.text && (
                        <p className="mt-3 text-base leading-relaxed text-slate-700">{sub.text}</p>
                      )}
                    </div>
                  ))}

                  {section.features && section.features.length > 0 && (
                    <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {section.features.map((f) => (
                        <li
                          key={f.title}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5"
                        >
                          <h3 className="font-bold text-slate-900">{f.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{f.desc}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  )
}
