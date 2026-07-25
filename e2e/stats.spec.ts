import { test, expect } from '@playwright/test'

test('decay offline: 2h fora derrubam fome (~-20) e alegria (~-12.5)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'jujuba:v1',
      JSON.stringify({
        version: 1,
        hunger: 80,
        happiness: 80,
        lastSeen: Date.now() - 2 * 3600 * 1000,
      }),
    )
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)

  const { hunger, happiness } = await page.evaluate(() => ({
    hunger: window.__jujuba.stats.hunger,
    happiness: window.__jujuba.stats.happiness,
  }))
  expect(hunger).toBeGreaterThan(58)
  expect(hunger).toBeLessThan(62)
  expect(happiness).toBeGreaterThan(66)
  expect(happiness).toBeLessThan(69)

  // HUD reflete os valores
  const widths = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.stat-fill')).map((el) =>
      parseFloat(el.style.width),
    ),
  )
  expect(widths[0]).toBeCloseTo(hunger, 0)
  expect(widths[1]).toBeCloseTo(happiness, 0)
})
