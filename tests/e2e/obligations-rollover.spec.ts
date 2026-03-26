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
  // When we see both gte/lte for a period, we store the mapping:
  // periodEnd -> periodStart, so later requests that only have lte can still use the correct start.
  const startByEnd = new Map<string, string>()

  const extractPeriodBounds = (url: URL) => {
    const allDateFilters = url.searchParams.getAll('date')
    const gte = allDateFilters.find((v) => v.startsWith('gte.'))
    const lte = allDateFilters.find((v) => v.startsWith('lte.'))
    const end = lte ? lte.slice(4) : null
    const start = gte ? gte.slice(4) : end ? startByEnd.get(end) ?? null : null

    if (gte && end) {
      startByEnd.set(end, gte.slice(4))
    }

    // الفallback (فقط إذا لم نتمكن من استنتاج start من أي request سابق)
    const inferredStart = end ? `${end.slice(0, 7)}-01` : null

    return {
      start: start ?? inferredStart ?? '2026-04-01',
      end: end ?? '2026-04-30',
    }
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
    const reqUrl = new URL(route.request().url())
    const { start, end } = extractPeriodBounds(reqUrl)
    const prevDay = dateMinusOneDay(start)
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
              due_date: end,
              date: start,
              created_at: `${start}T00:00:00.000Z`,
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
              due_date: end,
              date: start,
              created_at: `${start}T00:00:00.000Z`,
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
    const select = reqUrl.searchParams.get('select') ?? ''
    const statusFilter = reqUrl.searchParams.get('status') ?? ''
    const isPaidFilter = statusFilter.toLowerCase().includes('paid')
    const scenario = getScenario()
    const { start } = extractPeriodBounds(reqUrl)
    const prevDay = dateMinusOneDay(start)

    // Query #1: outflows list in current period (general expenses list)
    // ملاحظة: صفحة الالتزامات تستعمل outflows مع `select='*'` + `status=paid`.
    // لذلك نعيد بيانات المدفوعات فقط عندما يكون status=paid، وإلا نعيد [].
    if (select.includes('*') && !isPaidFilter) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      return
    }

    // obligation-payment outflows up to period end
    const payments =
      scenario === 'p4'
        ? [
            {
              amount: 500,
              date: start,
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

  // cash-liquidity additional endpoints used by the new available cash hook
  page.route('**/rest/v1/inflows**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  page.route('**/rest/v1/savings_transactions**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  page.route('**/rest/v1/investment_wallet_transactions**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
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

