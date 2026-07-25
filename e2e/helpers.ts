import type { Page } from '@playwright/test'

/** Passa pelo overlay inicial — formulário de batismo (1ª vez) ou tap simples. */
export async function startGame(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  if (await page.locator('.overlay-start').count()) {
    await page.locator('.overlay-start').click() // mantém o nome padrão Foxy
  } else {
    await page.locator('.overlay').click()
  }
}
