import { defineConfig, devices } from '@playwright/test';

// Sandboxes with a preinstalled Chromium of another revision set PW_CHROMIUM_PATH.
const executablePath = process.env.PW_CHROMIUM_PATH;
// Each run gets its own client IP (clientIp() reads X-Forwarded-For), so repeated runs never share rate-limit counters.
const second = Math.floor(Date.now() / 1000);
const runIp = `10.${(second >> 16) & 255}.${(second >> 8) & 255}.${second & 255}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    extraHTTPHeaders: { 'x-forwarded-for': runIp },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start:e2e',
      url: 'http://localhost:3100/login',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    // The worker sends the invitation and reset emails that the tests read from Mailpit.
    { command: 'npm run worker:e2e', wait: { stdout: /worker started/ }, timeout: 60_000 },
  ],
});
