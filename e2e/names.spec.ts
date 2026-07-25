import { test, expect } from '@playwright/test'
import { startGame } from './helpers'

test('primeira visita: pergunta o nome (padrão Foxy) e persiste', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)

  // formulário de batismo com Foxy pré-preenchido
  const input = page.locator('.overlay-input')
  await expect(input).toBeVisible()
  await expect(input).toHaveValue('Foxy')

  await input.fill('Nina')
  await page.locator('.overlay-start').click()

  expect(await page.evaluate(() => window.__jujuba.stats.name)).toBe('Nina')
  await expect(page).toHaveTitle('Nina 🦊')

  // volta: sem formulário, overlay saúda pelo nome
  await page.reload()
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  await expect(page.locator('.overlay-input')).toHaveCount(0)
  await expect(page.locator('.overlay h1')).toContainText('Nina')
  await startGame(page)
  expect(await page.evaluate(() => window.__jujuba.stats.name)).toBe('Nina')
})

test('nome vazio cai no padrão Foxy', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  await page.locator('.overlay-input').fill('   ')
  await page.locator('.overlay-start').click()
  expect(await page.evaluate(() => window.__jujuba.stats.name)).toBe('Foxy')
})
