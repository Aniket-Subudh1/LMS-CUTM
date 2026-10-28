import { expect, test, type Page } from '@playwright/test';

// Home redesign and M10 T7 (DSH-01, AC-M10-02). The e2e seed puts Student 11–20 of CUTM1014 A, taught by faculty2,
// in the low engagement band; the head of department teaches nothing there.
const password = process.env.E2E_PASSWORD ?? '';
const ETHICS = 'CUTM1014 · Gender, Human Rights and Ethics · 2026-ODD · A';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('a teacher’s quick actions ask which course, and the low band is one click from Home', async ({ page }) => {
  await signIn(page, 'faculty2@seed.cutm.test');
  const actions = page.getByRole('navigation', { name: 'Quick actions' });
  await expect(actions.getByRole('link', { name: 'New meeting' })).toBeVisible();

  // faculty2 teaches two active courses, so the job asks which.
  await actions.getByRole('button', { name: 'New assessment' }).click();
  await expect(page.getByText('Which course?')).toBeVisible();
  await page.getByRole('menuitem', { name: ETHICS }).click();
  await expect(page).toHaveURL(/\/assessments\?new=quiz$/);
  await expect(page.getByRole('dialog', { name: 'New assessment' })).toBeVisible();

  await page.goto('/home');
  const course = page.getByRole('region', { name: 'Your courses' }).getByRole('link', { name: ETHICS });
  await expect(course).toContainText('10 low engagement');
  await course.click();
  await expect(page).toHaveURL(/\/people\?band=low&status=active$/);
  await expect(page.getByRole('row').filter({ hasText: /student\d+@seed\.cutm\.test/ })).toHaveCount(10);
});

test('a head of department is told they are caught up and sees the department’s low engagement', async ({ page }) => {
  await signIn(page, 'hod@seed.cutm.test');
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByText('Nothing in your department needs you right now.')).toBeVisible();
  const low = page.getByRole('region', { name: 'Most students with low engagement' });
  await expect(low.getByRole('link', { name: ETHICS })).toContainText('10 low engagement');

  const actions = page.getByRole('navigation', { name: 'Quick actions' });
  await expect(actions.getByRole('link', { name: 'Continuous evaluation' })).toBeVisible();
  await actions.getByRole('link', { name: 'Engagement report' }).click();
  await expect(page).toHaveURL(/\/reports\/engagement$/);
});
