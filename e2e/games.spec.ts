import { test, expect, type Page } from '@playwright/test'
import { startGame, goToRoom } from './helpers'

// Assoprador de bolhas na sala de brinquedos (aro da varinha, lado direito).
const BLOWER = { x: 320, y: 490 }

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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startGame(page)
  await goToRoom(page, '🧸')
})

test('bolinha: arrastar move e arremessar dá velocidade', async ({ page }) => {
  const ballPx = await page.evaluate(() => window.__jujuba.ball.screenPosition())
  await canvasEvent(page, 'pointerdown', ballPx.x, ballPx.y)
  const grabbed = await page.evaluate(() => window.__jujuba.ball.dragging)
  expect(grabbed).toBe(true)

  // arrasta pro alto-esquerda com velocidade e solta
  for (let i = 1; i <= 6; i++) {
    await canvasEvent(page, 'pointermove', ballPx.x - i * 30, ballPx.y - i * 55)
    await page.waitForTimeout(16)
  }
  await canvasEvent(page, 'pointerup', ballPx.x - 180, ballPx.y - 330)
  await page.waitForTimeout(80)
  const speed = await page.evaluate(() => window.__jujuba.ball.speed)
  expect(speed).toBeGreaterThan(0.5) // saiu voando

  // e eventualmente sossega no chão
  await page.waitForFunction(() => window.__jujuba.ball.speed < 0.2, undefined, {
    timeout: 15_000,
  })
})

test('bolhas: assoprador inicia, estourar avança rodada, escapar encerra', async ({ page }) => {
  // brilho-convite do assoprador ligado
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__jujuba.needGlow.blowerIntensity)).toBeGreaterThan(0)

  // tap no assoprador
  await canvasEvent(page, 'pointerdown', BLOWER.x, BLOWER.y)
  await page.waitForTimeout(60)
  await canvasEvent(page, 'pointerup', BLOWER.x, BLOWER.y)
  await page.waitForFunction(() => window.__jujuba.state === 'PLAYING')
  await expect(page.locator('.game-hud')).toBeVisible()
  await expect(page.locator('.room-nav')).toBeHidden()

  // rodada 1: estoura todas (3 bolhas) mirando nas posições projetadas
  await page.waitForFunction(() => window.__jujuba.bubbles.bubbleCount > 0)
  for (let tries = 0; tries < 40; tries++) {
    const done = await page.evaluate(() => {
      const g = window.__jujuba.bubbles
      return g.round >= 2
    })
    if (done) break
    const targets = await page.evaluate(() => window.__jujuba.bubbles.screenPositions())
    for (const t of targets) {
      await canvasEvent(page, 'pointerdown', t.x, t.y)
      await canvasEvent(page, 'pointerup', t.x, t.y)
    }
    await page.waitForTimeout(120)
  }
  expect(await page.evaluate(() => window.__jujuba.bubbles.round)).toBeGreaterThanOrEqual(2)

  // agora deixa escapar: para de estourar → fim de jogo → IDLE
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE', undefined, {
    timeout: 25_000,
  })
  await expect(page.locator('.game-hud')).toBeHidden()
  await expect(page.locator('.room-nav')).toBeVisible()
})
