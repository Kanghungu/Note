import { defineConfig, devices } from '@playwright/test'

const devCommand =
  process.platform === 'win32'
    ? 'npm.cmd run dev -- -p 3000'
    : 'npm run dev -- -p 3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: devCommand,
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
