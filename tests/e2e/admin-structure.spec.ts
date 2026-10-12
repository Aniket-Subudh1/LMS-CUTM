import { expect, test, type Page } from '@playwright/test';

// Fixture users come from `npm run db:seed:e2e`; they all share E2E_PASSWORD from .env.e2e (10 §3).
const password = process.env.E2E_PASSWORD ?? '';
const run = Date.now();

// Next keeps the previous page mounted but hidden; getByLabel would match its fields too.
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('admin adds a department, finds a user and opens a course workspace', async ({ page }) => {
  await signIn(page, 'admin@seed.cutm.test');
  await page.getByRole('link', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();

  const code = `T${String(run).slice(-8)}`;
  await page.goto('/admin/departments');
  await field(page, 'Code').fill(code);
  await field(page, 'Name').fill(`Department ${code}`);
  await page.getByRole('button', { name: 'Add department' }).click();
  await expect(page.getByText('Department added.')).toBeVisible();
  await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible();

  await page.goto('/admin/users');
  await field(page, 'Search').fill('Student 05');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: 'Student 05' }).click();
  await expect(page.getByRole('heading', { name: 'Student 05' })).toBeVisible();
  await expect(page.getByText('2501CSE005').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('CS101 · C Programming').filter({ visible: true })).toBeVisible();

  await page.goto('/courses');
  await page.getByRole('link', { name: 'CS101 · C Programming · 2026-ODD · A' }).click();
  await expect(page.getByRole('heading', { name: 'CS101 · C Programming · 2026-ODD · A' })).toBeVisible();
  await expect(page.getByText('Explain the basic constructs of C.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PSO3' })).toBeVisible();
  await page.getByRole('tab', { name: 'People' }).click();
  await expect(page.getByRole('cell', { name: '2501CSE001' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2501CSE020' })).toBeVisible();

  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

test('faculty drops and re-adds a student from the roster', async ({ page }) => {
  await signIn(page, 'faculty1@seed.cutm.test');
  await page.getByRole('link', { name: 'My courses' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await page.getByRole('link', { name: 'CS101 · C Programming · 2026-ODD · A' }).click();
  await page.getByRole('tab', { name: 'People' }).click();

  const row = page.getByRole('row', { name: /2501CSE003/ });
  const apply = async (action: 'drop' | 'add') => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'enrolment.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`rollNo,action\n2501CSE003,${action}\n`),
    });
    await page.getByRole('button', { name: 'Apply changes' }).click();
    await expect(page.getByText('Enrolment updated.')).toBeVisible();
  };
  await apply('drop');
  await expect(row).toContainText('dropped');
  await apply('add');
  await expect(row).toContainText('active');

  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('rollNo,action\nNOPE,add\n'),
  });
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('No student has roll number NOPE.')).toBeVisible();
});

test('a student sees only their own course and cannot open administration', async ({ page }) => {
  await signIn(page, 'student01@seed.cutm.test');
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.getByRole('link', { name: 'My courses' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole('link', { name: 'CS101 · C Programming · 2026-ODD · A' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Excel Basics/ })).toHaveCount(0);

  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/courses');
  await page.getByRole('link', { name: 'CS101 · C Programming · 2026-ODD · A' }).click();
  await expect(page.getByRole('tab', { name: 'People' })).toHaveCount(0);
});
