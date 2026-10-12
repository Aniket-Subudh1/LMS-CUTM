import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

const MAILPIT = 'http://localhost:8025';

// Next keeps the previous page mounted but hidden; getByLabel would match its fields too.
const field = (page: Page, label: string | RegExp, options?: { exact: boolean }) =>
  page.getByLabel(label, options).filter({ visible: true });
const run = Date.now();

const MessageList = z.object({
  messages: z.array(z.object({ ID: z.string(), Subject: z.string(), To: z.array(z.object({ Address: z.string() })) })),
});
const Message = z.object({ Text: z.string() });

function createAdmin(email: string, name: string): string {
  const out = execFileSync(
    'npx',
    [
      'tsx',
      '--env-file=.env.e2e',
      '--conditions=react-server',
      'scripts/create-admin.ts',
      '--email',
      email,
      '--name',
      name,
    ],
    { encoding: 'utf8' },
  );
  const link = out.match(/http\S+/)?.[0];
  if (!link) throw new Error(`create-admin printed no link:\n${out}`);
  return link;
}

async function emailLink(to: string, subject: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const { messages } = MessageList.parse(await (await fetch(`${MAILPIT}/api/v1/messages`)).json());
        id = messages.find((m) => m.Subject === subject && m.To.some((t) => t.Address === to))?.ID;
        return id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  const { Text } = Message.parse(await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json());
  const link = Text.match(/http\S+/)?.[0];
  if (!link) throw new Error('email has no link');
  return link;
}

async function setPassword(page: Page, link: string, password: string) {
  await page.goto(link);
  await field(page, 'New password', { exact: true }).fill(password);
  await field(page, /^Repeat/).fill(password);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page, name: string) {
  await page.getByRole('button', { name }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('health check and security headers', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true, mongo: 'up', redis: 'up' });
  const headers = (await request.get('/login')).headers();
  expect(headers['content-security-policy']).toBe(
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
});

test('invited admin sets a password, signs in and out, and resets a forgotten password', async ({ page }) => {
  const email = `admin.${run}@cutm.local`;
  const name = 'Asha Mohanty';

  await page.goto('/home');
  await expect(page).toHaveURL(/\/login$/);

  const invite = createAdmin(email, name);
  expect(await emailLink(email, 'Your CUTM LMS account')).toBe(invite);
  await page.goto(invite);
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await setPassword(page, invite, 'first-password-123');
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible();
  await expect(page.getByText('Administrator')).toBeVisible();

  await page.goto(invite);
  await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible();

  await page.goto('/home');
  await signOut(page, name);
  await signIn(page, email, 'wrong-password-1');
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue(email);
  await field(page, 'Password').fill('first-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await signOut(page, name);

  await page.getByRole('link', { name: 'Reset it' }).click();
  // Wait for the new page: during the client navigation the old form is still visible and would take the fill.
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await field(page, 'Email').fill(email);
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('If that email is registered, a link has been sent.')).toBeVisible();
  const reset = await emailLink(email, 'Reset your CUTM LMS password');
  await page.goto(reset);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await setPassword(page, reset, 'second-password-456');
  await signOut(page, name);

  await signIn(page, email, 'first-password-123');
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await signIn(page, email, 'second-password-456');
  await expect(page).toHaveURL(/\/home$/);
});

test('changing the password and signing out everywhere end the other browser session', async ({ browser }) => {
  const email = `everywhere.${run}@cutm.local`;
  const name = 'Ravi Patnaik';
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await setPassword(first, createAdmin(email, name), 'first-password-123');
  await signIn(second, email, 'first-password-123');
  await expect(second).toHaveURL(/\/home$/);

  await first.goto('/profile');
  await field(first, 'Current password').fill('first-password-123');
  await field(first, 'New password', { exact: true }).fill('second-password-456');
  await field(first, /^Repeat/).fill('second-password-456');
  await first.getByRole('button', { name: 'Change password' }).click();
  await expect(first.getByText('Your password has been changed.')).toBeVisible();
  await expect(field(first, 'Current password')).toHaveValue('');
  await second.goto('/profile');
  await expect(second).toHaveURL(/\/login$/);

  await signIn(second, email, 'second-password-456');
  await expect(second).toHaveURL(/\/home$/);
  await first.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(first).toHaveURL(/\/login$/);
  await second.goto('/home');
  await expect(second).toHaveURL(/\/login$/);
});

test('phone width: no horizontal scroll and the sidebar opens as a sheet', async ({ browser }) => {
  const email = `phone.${run}@cutm.local`;
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
  const noHorizontalScroll = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto('/login');
  await noHorizontalScroll();
  await setPassword(page, createAdmin(email, 'Sita Das'), 'first-password-123');
  await noHorizontalScroll();
  await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeHidden();
  await noHorizontalScroll();
});

test('before hydration the sign-in form cannot submit, so fields never reach the URL', async ({ browser }) => {
  const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await page.goto('/login');
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await field(page, 'Email').fill('someone@cutm.local');
  await field(page, 'Password').fill('secret-password-1');
  await field(page, 'Password').press('Enter');
  await expect(page).toHaveURL(/\/login$/);
});
