import { test, expect } from '@playwright/test'
import { startGame } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await startGame(page)
})

test('salas: setinhas trocam, cada sala mostra seus controles', async ({ page }) => {
  // padrão: sala de estar → mic visível, roleta e dormir escondidos
  await expect(page.locator('.btn-mic')).toBeVisible()
  await expect(page.locator('.carousel')).toBeHidden()
  await expect(page.locator('.btn-sleep')).toBeHidden()

  // ‹ cozinha: roleta aparece, mic some
  await page.locator('.room-prev').click()
  await expect(page.locator('.carousel')).toBeVisible()
  await expect(page.locator('.btn-mic')).toBeHidden()

  // › › quarto: botão de dormir
  await page.locator('.room-next').click()
  await page.locator('.room-next').click()
  await expect(page.locator('.btn-sleep')).toBeVisible()
  await expect(page.locator('.carousel')).toBeHidden()
  await expect(page.locator('.btn-mic')).toBeHidden()

  // › banheiro: sem controles fixos (banho abre no tap da banheira)
  await page.locator('.room-next').click()
  await expect(page.locator('.btn-sleep')).toBeHidden()
  await expect(page.locator('.carousel')).toBeHidden()
  await expect(page.locator('.btn-mic')).toBeHidden()

  // › wrap: volta pra cozinha
  await page.locator('.room-next').click()
  await expect(page.locator('.carousel')).toBeVisible()
})

test('roleta: tocar no item lateral gira a seleção', async ({ page }) => {
  await page.locator('.room-prev').click() // cozinha
  const centerAlt = () => page.locator('.car-center img').getAttribute('alt')
  expect(await centerAlt()).toBe('Biscoito')
  await page.locator('.car-right').click()
  expect(await centerAlt()).toBe('Maçã')
  await page.locator('.car-left').click()
  expect(await centerAlt()).toBe('Biscoito')
})

test('dormir: energia regenera, Zzz, e cutucada acorda', async ({ page }) => {
  await page.locator('.room-next').click() // quarto
  await page.evaluate(() => {
    window.__jujuba.stats.energy = 20
  })
  await page.locator('.btn-sleep').click()
  await page.waitForFunction(() => window.__jujuba.state === 'SLEEPING')

  // energia sobe dormindo (2.5/s com o jogo aberto)
  const e0 = await page.evaluate(() => window.__jujuba.stats.energy)
  await page.waitForTimeout(1600)
  const e1 = await page.evaluate(() => window.__jujuba.stats.energy)
  expect(e1).toBeGreaterThan(e0 + 2)

  // cutucada acorda
  await page.evaluate(async () => {
    const canvas = document.querySelector('#game')!
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
    fire('pointerdown', 195, 300)
    await new Promise((r) => setTimeout(r, 60))
    fire('pointerup', 196, 301)
  })
  await page.waitForFunction(() => window.__jujuba.state === 'IDLE')
})

test('mic liga sozinho na sala e desliga ao sair', async ({ page }) => {
  await page.waitForFunction(() => window.__jujuba.voice?.enabled === true)

  await page.locator('.room-prev').click() // cozinha
  await page.waitForFunction(() => window.__jujuba.voice?.enabled === false)

  await page.locator('.room-next').click() // volta pra sala
  await page.waitForFunction(() => window.__jujuba.voice?.enabled === true)
})

test('mic desligado na mão NÃO religa sozinho', async ({ page }) => {
  await page.waitForFunction(() => window.__jujuba.voice?.enabled === true)
  await page.locator('.btn-mic').click() // desliga manualmente
  await page.waitForFunction(() => window.__jujuba.voice?.enabled === false)

  await page.locator('.room-prev').click() // cozinha
  await page.locator('.room-next').click() // volta pra sala
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.__jujuba.voice?.enabled)).toBe(false)
})

test('sala persiste entre visitas', async ({ page }) => {
  await page.locator('.room-prev').click() // cozinha
  await page.waitForTimeout(200)
  await page.reload()
  await startGame(page)
  await expect(page.locator('.carousel')).toBeVisible() // ainda na cozinha
})
