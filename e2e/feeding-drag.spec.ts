import { test, expect, type Page } from '@playwright/test'

// A boca fica em ~(195, 358) na viewport 390×844 (centro do rosto).
const MOUTH = { x: 195, y: 358 }

async function startDrag(page: Page): Promise<void> {
  await page.getByRole('button', { name: /comer/i }).click()
  await page.evaluate(() => {
    const btn = document.querySelector('.food-btn')!
    const r = btn.getBoundingClientRect()
    btn.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height / 2,
        bubbles: true,
      }),
    )
  })
}

function dragMove(page: Page, x: number, y: number): Promise<void> {
  return page.evaluate(
    ({ x, y }) => {
      document
        .querySelector('.food-btn')!
        .dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
    },
    { x, y },
  )
}

function dragUp(page: Page, x: number, y: number): Promise<void> {
  return page.evaluate(
    ({ x, y }) => {
      document
        .querySelector('.food-btn')!
        .dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }))
    },
    { x, y },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  await page.locator('.overlay').click()
})

test('arrastar até a boca: boca-imã abre e abocanha, fome +30', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.hunger = 40
  })
  await startDrag(page)
  expect(await page.evaluate(() => window.__jujuba.state)).toBe('DRAGGING')

  // aproxima devagarinho: a boca deve ir ABRINDO antes de abocanhar
  await dragMove(page, 195, 600)
  await page.waitForTimeout(250)
  await dragMove(page, 195, 470)
  await page.waitForTimeout(350)
  const jawNear = await page.evaluate(() => window.__jujuba.pose.jawOpen)
  expect(jawNear).toBeGreaterThan(0.2)

  // encosta na boca: abocanha sozinha (nem precisa soltar)
  await dragMove(page, MOUTH.x, MOUTH.y)
  await page.waitForFunction(() => window.__jujuba.state === 'EATING')
  await dragUp(page, MOUTH.x, MOUTH.y) // solta depois; não deve atrapalhar

  await page.waitForFunction(() => window.__jujuba.state === 'IDLE', undefined, { timeout: 10_000 })
  const hunger = await page.evaluate(() => window.__jujuba.stats.hunger)
  expect(hunger).toBeGreaterThan(69)
  expect(hunger).toBeLessThan(71)
})

test('soltar longe cancela: sem comida, sem fome, volta pro IDLE', async ({ page }) => {
  await page.evaluate(() => {
    window.__jujuba.stats.hunger = 40
  })
  await startDrag(page)
  await dragMove(page, 100, 700)
  await page.waitForTimeout(150)
  await dragUp(page, 60, 700)

  await page.waitForFunction(() => window.__jujuba.state === 'IDLE')
  const hunger = await page.evaluate(() => window.__jujuba.stats.hunger)
  expect(hunger).toBeLessThan(41) // nada de +30
})
