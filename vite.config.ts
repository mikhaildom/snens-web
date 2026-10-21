import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vite'

/**
 * Токен к локальному API snens подставляет dev-сервер, а не бандл:
 * в браузер секрет не попадает. Путь можно переопределить
 * (SNENS_API_TOKEN_FILE / SNENS_API_BASE), дефолт — прод-установка.
 */
const tokenFile =
  process.env.SNENS_API_TOKEN_FILE ??
  path.join(os.homedir(), '.local/share/snens/api.token')
const apiBase = process.env.SNENS_API_BASE ?? 'http://127.0.0.1:7420'
const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : ''

export default defineConfig({
  plugins: [react()],
  server: {
    // слушаем tailscale: и ssh-туннель, и десктоп-обёртка бьются в тот же адрес
    host: '100.73.69.107',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    watch: { ignored: ['**/dist/**'] },
    proxy: {
      '/api': {
        target: apiBase,
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api/, ''),
        // SSE не должен буферизоваться прокси
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (token) req.setHeader('Authorization', `Bearer ${token}`)
            req.setHeader('Accept-Encoding', 'identity')
          })
        },
      },
    },
  },
})
