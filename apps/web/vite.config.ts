import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8')) as {
  version: string
}

const repoRoot = path.resolve(__dirname, '../..')
const basePath = process.env.PUBLIC_BASE_PATH ?? '/'
const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`

export default defineConfig({
  base: normalizedBasePath,
  plugins: [react()],
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.ts',
    globals: true,
    css: true,
  },
})
