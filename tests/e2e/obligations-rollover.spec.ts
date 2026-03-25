import { test, expect, type Page, type Route } from '@playwright/test'

type Scenario = 'p4' | 'p5'

function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.')
}

function extractMoneyValue(cardText: string): number {
  const normalized = toWesternDigits(cardText)
  const matches = normalized.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  const parsed = matches
    .map((m) => Number.parseFloat(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
  return parsed.length ? parsed[parsed.length - 1] : Number.NaN
}

async function readSummaryValue(page: Page, title: RegExp): Promise<number> {
  const card = page.locator('div.rounded-xl.border.border-border.bg-white.p-4.shadow-sm', {
    has: page.getByText(title),
  })
  await expect(card.first()).toBeVisible()
  return extractMoneyValue(await card.first().innerText())
}

/** عنصر قائمة الالتزامات حسب عنوان البطاقة (h3) */
function obligationRow(page: Page, namePattern: RegExp) {
  return page.locator('ul[role="list"] > li').filter({ has: page.locator('h3', { hasText: namePattern }) })
}

function dateMinusOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Intercepts Supabase REST/Auth calls used by Outflow page.
 * We switch between two mocked accounting scenarios:
 * - p4: التزام واحد "سداد فيزا" إجمالي 1000، مسدد في الفترة 500
 * - p5: نفس الالتزام منطقياً كمرحّل (500 متبقي) + التزام جديد 200 => إجمالي الفترة 700، مسدد 0
 */
function setupSupabaseMocks(page: Page, getScenario: () => Scenario) {
  let currentStart = '2026-04-01'
  let currentEnd = '2026-04-30'

  const capturePeriodBounds = (url: URL) => {
    const allDateFilters = url.searchParams.getAll('date')
    const gte = allDateFilters.find((v) => v.startsWith('gte.'))
    const lte = allDateFilters.find((v) => v.startsWith('lte.'))
    if (gte) currentStart = gte.slice(4)
    if (lte) currentEnd = lte.slice(4)
  }

  page.route('**/auth/v1/user**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-user',
        email: 'qa@planora.app',
        user_metadata: {},
      }),
    })
  })

  page.route('**/rest/v1/obligations**', async (route: Route) => {
    const scenario = getScenario()
    const prevDay = dateMinusOneDay(currentStart)
    const obligations =
      scenario === 'p4'
        ? [
            {
              id: 'obl-1',
              user_id: 'e2e-user',
              name_ar: 'سداد فيزا',
              name_en: 'Visa payment',
              amount: 1000,
              paid_amount: 0,
              due_date: currentEnd,
              date: currentStart,
              created_at: `${currentStart}T00:00:00.000Z`,
            },
          ]
        : [
            {
              id: 'obl-old',
              user_id: 'e2e-user',
              name_ar: 'سداد فيزا',
              name_en: 'Visa payment',
              amount: 1000,
              paid_amount: 0,
              due_date: prevDay,
              date: prevDay,
              created_at: `${prevDay}T00:00:00.000Z`,
            },
            {
              id: 'obl-new',
              user_id: 'e2e-user',
              name_ar: 'التزام جديد',
              name_en: 'New obligation',
              amount: 200,
              paid_amount: 0,
              due_date: currentEnd,
              date: currentStart,
              created_at: `${currentStart}T00:00:00.000Z`,
            },
          ]

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(obligations),
    })
  })

  page.route('**/rest/v1/outflows**', async (route: Route) => {
    const reqUrl = new URL(route.request().url())
    capturePeriodBounds(reqUrl)
    const select = reqUrl.searchParams.get('select') ?? ''
    const scenario = getScenario()
    const prevDay = dateMinusOneDay(currentStart)

    // Query #1: outflows list in current period (general expenses list)
    if (select.includes('*')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
      return
    }

    // Query #2: obligation-payment outflows up to period end
    const payments =
      scenario === 'p4'
        ? [
            {
              amount: 500,
              date: currentStart,
              obligation_id: 'obl-1',
              name_ar: 'سداد فيزا — سداد التزام',
              name_en: 'Visa payment — obligation payment',
            },
          ]
        : [
            {
              amount: 500,
              date: prevDay,
              obligation_id: 'obl-old',
              name_ar: 'سداد فيزا — سداد التزام',
              name_en: 'Visa payment — obligation payment',
            },
          ]

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payments),
    })
  })
}

test.describe('Obligations rollover summary', () => {
  test('updates summary cards when changing period', async ({ page }) => {
    // Setup: isolate DB by mocking all Supabase calls used by this screen
    let scenario: Scenario = 'p4'
    setupSupabaseMocks(page, () => scenario)

    await page.goto('/outflow')

    // Ensure we are on obligations tab before asserting summary cards
    await page.getByRole('button', { name: /التزامات مالية|Financial obligations/i }).click()

    // Assert (Period 4): obligations=1000, paid=500
    await expect.poll(() => readSummaryValue(page, /إجمالي الالتزامات|Total obligations/i)).toBe(1000)
    await expect.poll(() => readSummaryValue(page, /إجمالي المسدد|Total paid/i)).toBe(500)

    // Assert (Period 4): عنصر قائمة "سداد فيزا" — تقدم 50% ومبالغ الفترة
    const visaRowP4 = obligationRow(page, /سداد فيزا|Visa payment/i)
    await expect(visaRowP4).toBeVisible()
    await expect(visaRowP4.getByText('50%')).toBeVisible()
    await expect(visaRowP4.getByText(/الإجمالي:\s*1,?000\.00|Total:\s*1,?000\.00/)).toBeVisible()
    await expect(visaRowP4.getByText(/المسدَّد:\s*500\.00|Paid:\s*500\.00/)).toBeVisible()

    // Act: switch mocked backend to period 5, then navigate to next period in UI
    scenario = 'p5'
    await page.getByRole('button', { name: /الفترة التالية|Next period/i }).click()

    // Assert (Period 5): carryover 500 + new 200 => 700, and paid in this period = 0
    await expect.poll(() => readSummaryValue(page, /إجمالي الالتزامات|Total obligations/i)).toBe(700)
    await expect.poll(() => readSummaryValue(page, /إجمالي المسدد|Total paid/i)).toBe(0)

    // Assert (Period 5): نفس الالتزام "سداد فيزا" — أساس الفترة 500، مسدد 0، تقدم 0%
    const visaRowP5 = obligationRow(page, /سداد فيزا|Visa payment/i)
    await expect.poll(async () => await visaRowP5.count()).toBeGreaterThanOrEqual(1)
    await expect(visaRowP5.first()).toBeVisible()
    await expect(visaRowP5.first().getByText('0%')).toBeVisible()
    await expect(visaRowP5.first().getByText(/الإجمالي:\s*500\.00|Total:\s*500\.00/)).toBeVisible()
    await expect(visaRowP5.first().getByText(/المسدَّد:\s*0\.00|Paid:\s*0\.00/)).toBeVisible()
  })
})

