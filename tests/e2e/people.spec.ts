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

// M10 T8 (AC-M10-01, AC-M10-02). The e2e seed gives CUTM1014 A's Student 01–10 a high score and Student 11–20 a low
// one (10), from their quiz attempts and study days alone.
test('a teacher lists the students with low engagement and opens one to see the numbers behind the score', async ({
  page,
}) => {
  const ethics = 'CUTM1014 · Gender, Human Rights and Ethics · 2026-ODD · A';
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('faculty2@seed.cutm.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/courses');
  await page.getByLabel('Search courses', { exact: true }).fill(ethics);
  await page.getByLabel('Search courses', { exact: true }).press('Enter');
  await page.getByRole('link', { name: ethics }).click();
  await page.getByRole('tab', { name: 'People' }).click();

  // A filter applies as soon as it is chosen.
  await page.getByLabel('Engagement', { exact: true }).selectOption('low');
  await expect(page).toHaveURL(/band=low/);
  const rows = page.getByRole('row').filter({ hasText: /student\d+@seed\.cutm\.test/ });
  await expect(rows).toHaveCount(10);
  await expect(rows.filter({ hasText: 'Student 01' })).toHaveCount(0);

  await rows
    .filter({ hasText: 'Student 11' })
    .getByRole('link', { name: /Student 11/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Student 11', exact: true })).toBeVisible();
  // One quiz attempt on one day, against the busiest tenth's 25 attempts on 5 days: (15 × 4% + 10 × 20%) ÷ 25 = 10.
  await expect(page.getByText('the busiest tenth of the class did 25.')).toBeVisible();
  await expect(page.getByText('Studied on 1 days; the busiest tenth of the class on 5.')).toBeVisible();
  await expect(page.getByText(/÷ 25 = 10\./)).toBeVisible();
});
