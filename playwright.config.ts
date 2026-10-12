import { defineConfig, devices } from '@playwright/test';

// Sandboxes with a preinstalled Chromium of another revision set PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start:e2e',
    url: 'http://localhost:3100/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
