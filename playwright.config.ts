import { defineConfig, devices } from '@playwright/test';

// Fixture passwords live only in .env.e2e (10 §3); the specs read E2E_PASSWORD from the environment.
process.loadEnvFile('.env.e2e');
// M04b (TP-09): the app and the worker run code on tests/e2e/fake-runner.ts, never on a server on the internet. The
// environment wins over --env-file, so this applies to both.
process.env.CODE_RUNNER_URL = 'http://localhost:2358';

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
    // M03: the live class asks for a camera and microphone; Chromium grants fake ones without a prompt.
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      ...(executablePath ? { executablePath } : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npx tsx tests/e2e/fake-runner.ts', url: 'http://localhost:2358/languages', timeout: 30_000 },
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
