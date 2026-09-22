import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// keys for the separate e2e supabase project, see .env.e2e.example
if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e')

const required = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY']
const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(', ')}. Copy .env.e2e.example to .env.e2e and fill it in.`)
}

// the tests create and delete users and workspaces, never let them touch the real project
if (existsSync('.env.local')) {
  const realUrl = parseEnv(readFileSync('.env.local', 'utf8')).NEXT_PUBLIC_SUPABASE_URL
  if (realUrl && realUrl === process.env.E2E_SUPABASE_URL) {
    throw new Error('E2E_SUPABASE_URL is the real project from .env.local. Use a separate test project.')
  }
}

const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  timeout: 4 * 60 * 1000,
  expect: { timeout: 15_000 },
  // gemini is occasionally busy, one retry in CI keeps that from failing the run
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // locally use the installed chrome, CI installs playwright's chromium
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // always start a fresh server with the test keys, never reuse one running with the real keys
    reuseExistingServer: false,
    timeout: 5 * 60 * 1000,
    env: {
      ...(process.env as Record<string, string>),
      NEXT_DIST_DIR: '.next-e2e',
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
})
