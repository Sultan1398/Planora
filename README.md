# Planora — Personal Finance Flow App

تطبيق ويب لإدارة الأموال الشخصية بدعم كامل للعربية (RTL) والإنجليزية (LTR).

## Tech Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** — Brand color: `#1B6EF3`
- **Supabase** (PostgreSQL + Auth + RLS)
- **Recharts** — Charts & visualizations
- **lucide-react** — Icons

## Getting Started

### 1. إعداد Supabase

1. أنشئ مشروعاً جديداً على [supabase.com](https://supabase.com)
2. انسخ Project URL و Anon Key
3. شغّل ملف SQL التالي في Supabase SQL Editor:
   ```
   supabase/migrations/001_initial_schema.sql
   ```

### 2. إعداد متغيرات البيئة

```bash
cp .env.example .env.local
```

ثم عدّل `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3. تشغيل المشروع

```bash
npm install
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000)

## App Sections

| Section | Route | Arabic |
|---------|-------|--------|
| Hub | `/hub` | المحفظة |
| Inflow | `/inflow` | الدخل |
| Outflow | `/outflow` | المصروف |
| Growth | `/growth` | النمو |
| Investments | `/investments` | الاستثمارات |
| Dashboard | `/dashboard` | التحليل |
| Year Stats | `/statistics` | إحصاءات العام |

## Core Concept: Dynamic Financial Period

كل مستخدم يحدد يوم بداية فترته المالية (1–28). الفترة تمتد من هذا اليوم في الشهر الحالي إلى اليوم السابق له في الشهر التالي.

**مثال:** يوم البداية = 25 → الفترة: 25 مارس → 24 أبريل

## Project Structure

```
src/
  app/
    (auth)/          # Login & Signup pages
    (app)/           # Protected app pages (requires auth)
    onboarding/      # First-time setup
  contexts/
    LanguageContext  # Bilingual support (ar/en)
    PeriodContext    # Financial period navigation
  lib/
    supabase/        # Client, Server, Proxy helpers
    period.ts        # Period calculation logic
    utils.ts         # cn(), formatCurrency()
  types/
    database.ts      # Full TypeScript DB types
  components/
    layout/          # Sidebar, PeriodNavigator
    ui/              # Reusable components
supabase/
  migrations/        # SQL schema files
.cursor/rules/       # AI coding guidelines
```
