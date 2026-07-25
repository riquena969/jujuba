import { test, expect } from '@playwright/test'
import { startGame } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startGame(page)
  await page.locator('.room-prev').click() // cozinha
})

test('puxar item que NÃO é o central alimenta com ele (suco)', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.hunger = 40
  })
  // arrasta o botão do SUCO (fora do centro) pra cima até a raposa
  await page.evaluate(async () => {
    const btn = document.querySelector('.food-btn[data-kind="juice"]')!
    const r = btn.getBoundingClientRect()
    const fire = (type: string, x: number, y: number) =>
      btn.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    const x0 = r.x + r.width / 2
    const y0 = r.y + r.height / 2
    fire('pointerdown', x0, y0)
    // primeiro movimento pra CIMA = modo alimentar
    for (let i = 1; i <= 8; i++) {
      fire('pointermove', x0 + (195 - x0) * (i / 8), y0 - (y0 - 360) * (i / 8))
      await new Promise((res) => setTimeout(res, 30))
    }
    fire('pointerup', 195, 360)
  })
  await page.waitForFunction(() => window.__jujuba.state === 'EATING')
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE', undefined, { timeout: 10_000 })
  const hunger = await page.evaluate(() => window.__jujuba.stats.hunger)
  expect(hunger).toBeGreaterThan(69)
})

test('barriga cheia: alimentar com fome ~100 solta um arrotinho', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.hunger = 99
  })
  const burpsBefore = await page.evaluate(() => window.__jujuba.feeding.burps)
  // tap no primeiro item (voo automático)
  await page.evaluate(async () => {
    const btn = document.querySelector('.food-btn')!
    const r = btn.getBoundingClientRect()
    const fire = (type: string) =>
      btn.dispatchEvent(
        new PointerEvent(type, {
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
          bubbles: true,
        }),
      )
    fire('pointerdown')
    await new Promise((res) => setTimeout(res, 60))
    fire('pointerup')
  })
  await page.waitForFunction(() => window.__jujuba.state === 'EATING')
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE', undefined, { timeout: 10_000 })
  const burpsAfter = await page.evaluate(() => window.__jujuba.feeding.burps)
  expect(burpsAfter).toBe(burpsBefore + 1)
})
