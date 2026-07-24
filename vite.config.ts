import { defineConfig } from 'vite'
import fs from 'node:fs'

// HTTPS local via mkcert (necessário pro mic no iPhone na LAN).
// E2E/CI roda HTTP puro em localhost: JUJUBA_NO_HTTPS=1.
const hasCerts = fs.existsSync('certs/key.pem') && fs.existsSync('certs/cert.pem')
const https =
  hasCerts && !process.env.JUJUBA_NO_HTTPS
    ? { key: fs.readFileSync('certs/key.pem'), cert: fs.readFileSync('certs/cert.pem') }
    : undefined

export default defineConfig({
  server: { host: true, https },
  preview: { host: true, https },
})
