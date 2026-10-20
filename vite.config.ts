import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // слушаем всё: доступ и по tailscale (100.73.69.107), и через ssh-туннель
    host: '100.73.69.107',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
    watch: { ignored: ['**/dist/**'] },
  },
})
