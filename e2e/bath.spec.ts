import { test, expect, type Page } from '@playwright/test'
import { startGame } from './helpers'

// Banheira do banheiro na viewport 390×844 (corpo branco, lado esquerdo).
const TUB = { x: 60, y: 430 }

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

async function sweepFox(page: Page): Promise<void> {
  await canvasEvent(page, 'pointerdown', 195, 400)
  for (let i = 0; i < 12; i++) {
    await canvasEvent(page, 'pointermove', 160 + (i % 3) * 35, 380 + i * 12)
    await page.waitForTimeout(25)
  }
  await canvasEvent(page, 'pointerup', 195, 500)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startGame(page)
  await page.waitForFunction(() => window.__jujuba.bath?.ready) // bath-set.glb no ar
  // sala → cozinha → banheiro (wrap pra trás)
  await page.locator('.room-prev').click()
  await page.locator('.room-prev').click()
})

test('banho completo: suja → banheira → ensaboa → enxagua → limpinha → voltar', async ({ page }) => {
  // bem suja: manchas visíveis no corpo
  await page.evaluate(() => {
    window.__jujuba.stats.setHygiene(15)
  })
  expect(await page.evaluate(() => window.__jujuba.dirt.count)).toBeGreaterThan(4)

  // tap na banheira entra no modo banho
  await canvasEvent(page, 'pointerdown', TUB.x, TUB.y)
  await page.waitForTimeout(60)
  await canvasEvent(page, 'pointerup', TUB.x, TUB.y)
  await page.waitForFunction(() => window.__jujuba.state === 'BATHING')

  await expect(page.locator('.bath-tools')).toBeVisible()
  await expect(page.locator('.btn-back')).toBeVisible()
  await expect(page.locator('.room-nav')).toBeHidden()

  // esponja (padrão): esfregar cobre de espuma
  await sweepFox(page)
  const foam = await page.evaluate(() => window.__jujuba.bath.foamCount)
  expect(foam).toBeGreaterThan(5)

  // ducha: enxagua tudo → celebração (+alegria)
  const happyBefore = await page.evaluate(() => {
    window.__jujuba.stats.happiness = 60
    return 60
  })
  await page.locator('.tool-btn[data-tool="shower"]').click()
  for (let round = 0; round < 6; round++) {
    await sweepFox(page)
    const left = await page.evaluate(() => window.__jujuba.bath.foamCount)
    if (left === 0) break
  }
  expect(await page.evaluate(() => window.__jujuba.bath.foamCount)).toBe(0)
  const happyAfter = await page.evaluate(() => window.__jujuba.stats.happiness)
  expect(happyAfter).toBeGreaterThan(happyBefore + 5)
  expect(await page.evaluate(() => window.__jujuba.state)).toBe('BATHING')

  // limpinha: higiene cheia (o decay segue vivo, então ~100) e manchas sumiram
  expect(await page.evaluate(() => window.__jujuba.stats.hygiene)).toBeGreaterThan(99)
  expect(await page.evaluate(() => window.__jujuba.dirt.count)).toBe(0)

  // voltar restaura o banheiro
  await page.locator('.btn-back').click()
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE')
  await expect(page.locator('.room-nav')).toBeVisible()
  await expect(page.locator('.bath-tools')).toBeHidden()
})

test('tap fora da banheira não entra no banho', async ({ page }) => {
  await canvasEvent(page, 'pointerdown', 330, 200) // parede vazia
  await page.waitForTimeout(60)
  await canvasEvent(page, 'pointerup', 330, 200)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__jujuba.state)).not.toBe('BATHING')
})
