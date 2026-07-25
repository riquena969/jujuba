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

/** Navega até a sala pelo ÍCONE (robusto a mudanças na ordem das salas). */
export async function goToRoom(page: Page, icon: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const current = await page.locator('.room-icon').textContent()
    if (current === icon) return
    await page.locator('.room-next').click()
    await page.waitForTimeout(150)
  }
  throw new Error(`sala ${icon} não encontrada`)
}
