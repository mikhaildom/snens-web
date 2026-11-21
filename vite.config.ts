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
// Прокси можно выключить совсем (SNENS_PROXY=0): так проверяется режим прямого
// подключения на том же порту — без него `/api` молча уходил бы в ядро, и тест
// «работает ли window.__SNENS__» доказывал бы работу прокси.
const proxyOn = process.env.SNENS_PROXY !== '0'
const apiBase = process.env.SNENS_API_BASE ?? 'http://127.0.0.1:7420'
const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : ''
/**
 * Порт задаётся окружением: 5174 — рабочий порт человека (там открыт браузер
 * с прод-ядром), стенду нужен свой, иначе он занимает его и глушит чужой vite
 * (`strictPort` превращает это в гонку, кто первый). Дефолт остаётся 5174:
 * обычный `npm run dev` ведёт себя как раньше.
 */
const port = Number(process.env.SNENS_WEB_PORT ?? 5174)

export default defineConfig({
  plugins: [react()],
  // Признак «на этой странице есть прокси /api» уезжает в бандл константой:
  // по нему `lib/connection.ts` решает, показывать ли экран пейринга.
  define: { __SNENS_PROXY__: JSON.stringify(proxyOn) },
  // Цель сборки явно: дефолт Vite 8 («baseline widely available») новее
  // браузеров, которые ещё живут на Windows 7 — Chrome/WebView2 109 (последние
  // для Win7, ими же собран Supermium-база) и Firefox ESR 115. Без этого бандл
  // может содержать синтаксис, который там не парсится, и страница остаётся белой.
  build: { target: ['chrome109', 'firefox115', 'edge109', 'safari16'] },
  server: {
    // слушаем tailscale: и ssh-туннель, и десктоп-обёртка бьются в тот же адрес
    host: '100.73.69.107',
    port,
    strictPort: true,
    allowedHosts: true,
    watch: { ignored: ['**/dist/**'] },
    proxy: {
      // При SNENS_PROXY=0 прокси нет вовсе: клиент обязан сам знать адрес
      // (окно оболочки или пейринг) — это и есть проверка прямого режима.
      ...(proxyOn
        ? {
            '/api': {
              target: apiBase,
              changeOrigin: false,
              rewrite: (p: string) => p.replace(/^\/api/, ''),
              // SSE не должен буферизоваться прокси
              configure: (proxy) => {
                proxy.on('proxyReq', (req) => {
                  if (token) req.setHeader('Authorization', `Bearer ${token}`)
                  req.setHeader('Accept-Encoding', 'identity')
                })
              },
            },
          }
        : {}),
    },
  },
})
