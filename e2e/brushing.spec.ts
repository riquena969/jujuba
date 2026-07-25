import { test, expect, type Page } from '@playwright/test'
import { startGame, goToRoom } from './helpers'

// Pia do banheiro (lado direito) na viewport 390×844.
const SINK = { x: 345, y: 450 }

function canvasEvent(page: Page, type: string, x: number, y: number): Promise<void> {
  return page.evaluate(
    ({ type, x, y }) => {
      document
        .querySelector('#game')!
        .dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    },
    { type, x, y },
  )
}

async function scrubMouth(page: Page): Promise<void> {
  await canvasEvent(page, 'pointerdown', 195, 360)
  for (let i = 0; i < 14; i++) {
    await canvasEvent(page, 'pointermove', 150 + (i % 3) * 45, 330 + (i % 5) * 22)
    await page.waitForTimeout(20)
  }
  await canvasEvent(page, 'pointerup', 195, 360)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startGame(page)
})

test('comer suja os dentinhos', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.setTeeth(100)
    window.__jujuba.stats.hunger = 40
  })
  await page.locator('.room-prev').click() // cozinha
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
  const teeth = await page.evaluate(() => window.__jujuba.stats.teeth)
  expect(teeth).toBeLessThan(90) // biscoito: -15
  expect(teeth).toBeGreaterThan(80)
})

test('escovação completa: pia → escova → enxagua → dentes novos', async ({ page }) => {
  await page.waitForFunction(() => window.__jujuba.brush?.ready)
  await page.evaluate(() => {
    window.__jujuba.stats.setTeeth(20)
  })
  expect(await page.evaluate(() => window.__jujuba.mouthDirt.count)).toBeGreaterThan(1)

  await goToRoom(page, '🛁')

  // tap na pia entra na escovação
  await canvasEvent(page, 'pointerdown', SINK.x, SINK.y)
  await page.waitForTimeout(60)
  await canvasEvent(page, 'pointerup', SINK.x, SINK.y)
  await page.waitForFunction(() => window.__jujuba.state === 'BRUSHING')
  await expect(page.locator('.brush-tools')).toBeVisible()
  await expect(page.locator('.btn-back')).toBeVisible()

  // escova até completar
  for (let round = 0; round < 8; round++) {
    await scrubMouth(page)
    const p = await page.evaluate(() => window.__jujuba.brush.progress)
    if (p >= 1) break
  }
  expect(await page.evaluate(() => window.__jujuba.brush.progress)).toBeGreaterThanOrEqual(1)

  // enxaguar: gargarejo + cuspidinha + dentes 100
  await page.locator('.tool-btn[data-tool="rinse"]').click()
  await page.waitForFunction(() => window.__jujuba.stats.teeth > 99, undefined, {
    timeout: 6_000,
  })
  expect(await page.evaluate(() => window.__jujuba.mouthDirt.count)).toBe(0)
  expect(await page.evaluate(() => window.__jujuba.state)).toBe('BRUSHING')

  // voltar
  await page.locator('.btn-back').click()
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE')
})

test('brilho de necessidade: banheira e pia piscam quando precisam', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.setHygiene(20)
    window.__jujuba.stats.setTeeth(20)
  })
  await goToRoom(page, '🛁')
  await page.waitForTimeout(600)
  const glow1 = await page.evaluate(() => ({
    tub: window.__jujuba.needGlow.tubIntensity,
    sink: window.__jujuba.needGlow.sinkIntensity,
  }))
  expect(glow1.tub).toBeGreaterThan(0)
  expect(glow1.sink).toBeGreaterThan(0)

  await page.evaluate(() => {
    window.__jujuba.stats.setHygiene(100)
    window.__jujuba.stats.setTeeth(100)
  })
  await page.waitForTimeout(300)
  const glow2 = await page.evaluate(() => ({
    tub: window.__jujuba.needGlow.tubIntensity,
    sink: window.__jujuba.needGlow.sinkIntensity,
  }))
  expect(glow2.tub).toBe(0)
  expect(glow2.sink).toBe(0)
})
