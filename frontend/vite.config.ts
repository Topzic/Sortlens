import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function getBackendPort(): number {
  const portFile = path.resolve(__dirname, '..', 'backend', '.port')
  try {
    const content = fs.readFileSync(portFile, 'utf-8').trim()
    const port = parseInt(content, 10)
    if (port > 0 && port < 65536) return port
  } catch {
    // .port file not yet written — fall back to default
  }
  return 8000
}

const backendPort = getBackendPort()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
