import { expect, test } from '@playwright/test';

// M04b phase E3 (TP-10). The e2e server has no AI key, so faculty1 (from `npm run db:seed:e2e`) finds "Draft with AI"
// on CUTM1602's question bank saying it is not set up, and asking anyway is refused with that message.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';

test('without an AI key, drafting with AI says it is not set up', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('faculty1@seed.cutm.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/courses?q=${encodeURIComponent(COURSE)}`);
  await page.getByRole('link', { name: COURSE }).click();
  await page.getByRole('tab', { name: 'Question bank' }).click();
  await page.getByRole('link', { name: 'Draft with AI' }).click();

  const dialog = page.getByRole('dialog', { name: 'Draft questions with AI' });
  await expect(dialog.getByText('AI suggestions are not set up.')).toBeVisible();
  await expect(dialog.getByText('No student data leaves the LMS.')).toBeVisible();
  await dialog.getByLabel('Topic').fill('Pointers and dynamic memory in C');
  await dialog.getByRole('checkbox', { name: /CO1/ }).check();
  await dialog.getByRole('button', { name: 'Draft the questions' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('AI suggestions are not set up.');
});
