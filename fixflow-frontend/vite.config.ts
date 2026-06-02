import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Dynamic resolution for ES module dirname compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

try {
  const src = 'C:/Users/sawad/.gemini/antigravity-ide/brain/5e75da39-0315-4b5c-b105-b62215643a50/auth_banner_1779440929927.png'
  const destDir = path.join(__dirname, 'src/assets')
  const dest = path.join(destDir, 'auth_banner.png')
  if (fs.existsSync(src)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    fs.copyFileSync(src, dest)
    console.log('Successfully copied auth banner asset.')
  }
} catch (e) {
  console.error('Failed to copy auth banner asset:', e)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
