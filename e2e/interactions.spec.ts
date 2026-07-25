import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  await page.locator('.overlay').click() // "Toque para começar"
})

test('carinho: esfregada vira PETTING e sobe a alegria', async ({ page }) => {
  const before = await page.evaluate(() => {
    window.__jujuba.stats.happiness = 50
    return window.__jujuba.stats.happiness
  })

  await page.evaluate(async () => {
    const canvas = document.querySelector('#game')!
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    fire('pointerdown', 195, 400)
    for (let i = 0; i < 30; i++) {
      fire('pointermove', 160 + (i % 2) * 70, 380 + (i % 8) * 12)
      await new Promise((r) => setTimeout(r, 25))
    }
  })

  expect(await page.evaluate(() => window.__jujuba.state)).toBe('PETTING')
  const after = await page.evaluate(() => window.__jujuba.stats.happiness)
  expect(after).toBeGreaterThan(before)
})

test('poke: tap rápido vira POKED e volta pro IDLE', async ({ page }) => {
  await page.evaluate(async () => {
    const canvas = document.querySelector('#game')!
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    fire('pointerdown', 195, 300)
    await new Promise((r) => setTimeout(r, 60))
    fire('pointerup', 196, 301)
  })
  expect(await page.evaluate(() => window.__jujuba.state)).toBe('POKED')
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE')
})

test('comer (tap): bandeja → voo automático → EATING → fome +30 → IDLE', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.hunger = 40
  })
  await page.getByRole('button', { name: /comer/i }).click()
  // tap rapidinho no biscoito = voo automático até a boca
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

  const hunger = await page.evaluate(() => window.__jujuba.stats.hunger)
  expect(hunger).toBeGreaterThan(69)
  expect(hunger).toBeLessThan(71)
})
