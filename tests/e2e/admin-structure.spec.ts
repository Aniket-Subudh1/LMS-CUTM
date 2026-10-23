import { expect, test, type Page } from '@playwright/test';

// Fixture users come from `npm run db:seed:e2e`; they all share E2E_PASSWORD from .env.e2e (10 §3).
const password = process.env.E2E_PASSWORD ?? '';
const run = Date.now();

// Next keeps the previous page mounted but hidden; getByLabel would match its fields too.
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });

// My courses shows ten a page and earlier runs leave offerings behind, so find the seeded one by searching for it.
async function findCourse(page: Page, title: string) {
  await field(page, 'Search courses').fill(title);
  await field(page, 'Search courses').press('Enter');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === title);
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('admin adds a department, finds a user and opens a course workspace', async ({ page }) => {
  await signIn(page, 'admin@seed.cutm.test');
  await page.getByRole('link', { name: 'Structure', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Academic structure' })).toBeVisible();

  const code = `T${String(run).slice(-8)}`;
  await page.goto('/admin/departments');
  // Ten a page and earlier runs leave departments behind, so the new one shows in the list's total.
  const showing = page.getByText(/^Showing \d+–\d+ of \d+$/);
  const before = Number((await showing.textContent())?.split(' of ')[1]);
  await page.getByRole('button', { name: 'Add department' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a department' });
  await dialog.getByLabel('Code', { exact: true }).fill(code);
  await dialog.getByLabel('Name', { exact: true }).fill(`Department ${code}`);
  await dialog.getByRole('button', { name: 'Add department' }).click();
  await expect(dialog.getByText('Department added.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(showing).toHaveText(new RegExp(` of ${before + 1}$`));

  await page.goto('/admin/users');
  await field(page, 'Search users').fill('Student 05');
  await field(page, 'Search users').press('Enter');
  await page.getByRole('link', { name: 'Student 05' }).click();
  await expect(page.getByRole('heading', { name: 'Student 05' })).toBeVisible();
  await expect(page.getByText('2501CSE005').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('CUTM1602 · Programming in C').filter({ visible: true })).toBeVisible();

  await page.goto('/courses');
  await findCourse(page, 'CUTM1602 · Programming in C · 2026-ODD · A');
  await page.getByRole('link', { name: 'CUTM1602 · Programming in C · 2026-ODD · A' }).click();
  // M03b: the header names the course; its outcomes and their mapping have a tab of their own.
  await expect(page.getByRole('heading', { name: 'Programming in C', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Outcomes' }).click();
  await expect(page.getByText('Explain the basic constructs of C.').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PSO3' })).toBeVisible();
  await page.getByRole('tab', { name: 'People' }).click();
  await expect(page.getByRole('cell', { name: '2501CSE001' })).toBeVisible();
  // Ten to a page: the twentieth student is on the second.
  await page.getByRole('link', { name: 'Page 2' }).click();
  await expect(page.getByRole('cell', { name: '2501CSE020' })).toBeVisible();

  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

// AC-M01b-06: one dialog creates an offering per section, with its students; a student sees theirs once it is active.
test('admin offers a course to two sections at once and a student of one sees it', async ({ page }) => {
  await signIn(page, 'admin@seed.cutm.test');
  const term = `E${String(run).slice(-8)}`;
  await page.goto('/admin/terms');
  await page.getByRole('button', { name: 'Add term' }).click();
  const termDialog = page.getByRole('dialog', { name: 'Add a term' });
  await termDialog.getByLabel('Code', { exact: true }).fill(term);
  await termDialog.getByLabel('Academic year', { exact: true }).fill('2027-28');
  await termDialog.getByLabel('Name', { exact: true }).fill(`Term ${term}`);
  await termDialog.getByLabel('Starts on', { exact: true }).fill('2027-07-01');
  await termDialog.getByLabel('Ends on', { exact: true }).fill('2027-12-20');
  await termDialog.getByRole('button', { name: 'Add term' }).click();
  await expect(termDialog).toBeHidden();

  await page.goto('/admin/offerings');
  await page.getByRole('button', { name: 'New offering' }).click();
  const dialog = page.getByRole('dialog', { name: 'New offering' });
  // Both programmes have a 2025 batch; the BTECH-CSE group holds the one this course is listed for.
  const batch = await dialog.locator('optgroup[label^="BTECH-CSE"] option').first().getAttribute('value');
  await dialog.getByRole('combobox', { name: 'Batch' }).selectOption(batch ?? '');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await dialog
    .getByRole('combobox', { name: 'Course' })
    .selectOption({ label: 'CUTM1014 · Gender, Human Rights and Ethics · 1.5-0-1.5' });
  await dialog.getByRole('combobox', { name: 'Term' }).selectOption({ label: `${term} · Term ${term}` });
  await expect(dialog.getByRole('checkbox', { name: 'Section A' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Section B' })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Lipika Das' }).check();
  // The course has project credits, so the project question appears.
  await dialog.getByRole('radio', { name: 'Task tracker' }).check();
  await dialog.getByRole('button', { name: 'Create offerings and enrol students' }).click();
  await expect(dialog.getByText('Offerings created and students enrolled.')).toBeVisible();
  await expect(dialog).toBeHidden();

  const title = `CUTM1014 · Gender, Human Rights and Ethics · ${term} · A`;
  await page.goto('/admin/offerings');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(page.getByRole('row', { name: new RegExp(`${term} · B`) })).toBeVisible();
  await row.getByRole('button', { name: 'Activate' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Activate' }).click();
  await expect(row.getByText('active')).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, 'student01@seed.cutm.test');
  await page.goto('/courses');
  await expect(page.getByRole('link', { name: title })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`${term} · B`) })).toHaveCount(0);
});

// The CSV path; dropping and adding one student from a row is people.spec.ts.
test('faculty drops and re-adds a student with a CSV of changes', async ({ page }) => {
  await signIn(page, 'faculty1@seed.cutm.test');
  await page.getByRole('link', { name: 'My courses', exact: true }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await findCourse(page, 'CUTM1602 · Programming in C · 2026-ODD · A');
  await page.getByRole('link', { name: 'CUTM1602 · Programming in C · 2026-ODD · A' }).click();
  await page.getByRole('tab', { name: 'People' }).click();

  const row = page.getByRole('row', { name: /2501CSE003/ });
  const dialog = page.getByRole('dialog', { name: 'Upload a list of changes' });
  const upload = async (csv: string) => {
    await page.getByRole('link', { name: 'Upload CSV' }).click();
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'enrolment.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await dialog.getByRole('button', { name: 'Apply changes' }).click();
  };
  await upload('rollNo,action\n2501CSE003,drop\n');
  await expect(dialog.getByText('Enrolment updated.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('dropped');
  await upload('rollNo,action\n2501CSE003,add\n');
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('active');

  await upload('rollNo,action\nNOPE,add\n');
  await expect(dialog.getByText('No student has roll number NOPE.')).toBeVisible();
});

test('a student sees only their own course and cannot open administration', async ({ page }) => {
  await signIn(page, 'student01@seed.cutm.test');
  await expect(page.getByRole('link', { name: 'Structure', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'My courses', exact: true }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await findCourse(page, 'CUTM1602 · Programming in C · 2026-ODD · A');
  await expect(page.getByRole('link', { name: 'CUTM1602 · Programming in C · 2026-ODD · A' })).toBeVisible();
  await findCourse(page, 'Excel Basics');
  await expect(page.getByRole('link', { name: /Excel Basics/ })).toHaveCount(0);

  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/courses');
  await findCourse(page, 'CUTM1602 · Programming in C · 2026-ODD · A');
  await page.getByRole('link', { name: 'CUTM1602 · Programming in C · 2026-ODD · A' }).click();
  await expect(page.getByRole('tab', { name: 'People' })).toHaveCount(0);
});
