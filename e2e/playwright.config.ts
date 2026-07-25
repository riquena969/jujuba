import { defineConfig } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // um browser por vez — o mic fake toca o WAV uma única vez por contexto
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${path.resolve('e2e/fixtures/voice.wav')}%noloop`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    env: { JUJUBA_NO_HTTPS: '1' },
  },
})
