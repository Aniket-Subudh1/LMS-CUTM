import { expect, test } from '@playwright/test';

// M03b T7, acceptance 9. Fixture users come from `npm run db:seed:e2e` (10 §3). The student is dropped and added back,
// so the class ends as it started.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';

test('a teacher drops a student from the roster and adds them back by roll number', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('faculty1@seed.cutm.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/courses');
  await page.getByLabel('Search courses', { exact: true }).fill(COURSE);
  await page.getByLabel('Search courses', { exact: true }).press('Enter');
  await page.getByRole('link', { name: COURSE }).click();
  await page.getByRole('tab', { name: 'People' }).click();
  await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible();

  // The search finds one student by roll number.
  await page.getByLabel('Search students').fill('2501CSE020');
  await page.getByLabel('Search students').press('Enter');
  const row = page.getByRole('row').filter({ hasText: '2501CSE020' });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'Actions for Student 20' }).click();
  await page.getByRole('menuitem', { name: 'Drop from the class' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Drop' }).click();
  await expect(row.getByText('dropped')).toBeVisible();

  await page.getByRole('link', { name: 'Add student' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a student' });
  await dialog.getByLabel('Roll number or email').fill('2501cse020');
  await dialog.getByRole('button', { name: 'Add student' }).click();
  await expect(dialog.getByText('Student added.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(row.getByText('active')).toBeVisible();
});
