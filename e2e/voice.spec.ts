import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __jujuba: {
      state: string
      rigReady: boolean
      pose: { jawOpen: number }
      voice: { enabled: boolean } | null
      stats: { hunger: number; happiness: number }
    }
  }
}

async function waitState(page: Page, state: string, timeout = 12_000): Promise<void> {
  await page.waitForFunction((s) => window.__jujuba.state === s, state, { timeout })
}

test('imitar: IDLE → LISTENING → REPLAYING → IDLE com jaw sync', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__jujuba?.rigReady)
  await page.locator('.overlay').click() // "Toque para começar"

  // liga o mic — o Chromium "fala" o voice.wav pelo dispositivo fake
  await page.getByRole('button', { name: /falar/i }).click()
  await page.waitForFunction(() => window.__jujuba.voice?.enabled)

  await waitState(page, 'LISTENING')
  await waitState(page, 'REPLAYING')

  // enquanto repete, a mandíbula tem que estar mexendo
  const jaw = await page.evaluate(() => window.__jujuba.pose.jawOpen)
  expect(jaw).toBeGreaterThan(0.02)

  await waitState(page, 'IDLE')
})
