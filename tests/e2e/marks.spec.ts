import { expect, test, type Browser, type Page } from '@playwright/test';

// M06 T5. Fixture users come from `npm run db:seed:e2e` and share E2E_PASSWORD (10 §3); Playwright starts the worker
// that works the internal marks out.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return page;
}

async function openCourse(page: Page): Promise<string> {
  await page.goto('/courses');
  await page.getByLabel('Search courses', { exact: true }).fill(COURSE);
  await page.getByLabel('Search courses', { exact: true }).press('Enter');
  await page.getByRole('link', { name: COURSE }).click();
  await expect(page.getByRole('heading', { name: 'Programming in C', exact: true })).toBeVisible();
  return new URL(page.url()).pathname;
}

test('an assessment counts toward Mid-term I, a teacher fills the practice rubric, and the marks follow', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  const course = await openCourse(faculty);

  // Q-41: the New assessment dialog asks what it counts toward, and the builder's Settings card says it.
  await faculty.goto(`${course}/assessments?new=quiz`);
  const dialog = faculty.getByRole('dialog', { name: 'New assessment' });
  await dialog.getByLabel('Title', { exact: true }).fill(`Mid-term test ${run}`);
  await dialog.getByText('Mid-term I', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create and add questions' }).click();
  await expect(faculty).toHaveURL(/\/edit$/);
  const settings = faculty.locator('section').filter({ has: faculty.getByRole('heading', { name: 'Settings' }) });
  await expect(settings.getByText('Counts toward')).toBeVisible();
  await expect(settings.getByText('Mid-term I', { exact: true })).toBeVisible();

  // The Marks tab lists it under Mid-term I, as a draft for now.
  await faculty.getByRole('tab', { name: 'Marks' }).click();
  await expect(faculty.getByText(`Mid-term test ${run} · quiz · 0 marks · draft`)).toBeVisible();

  // M2 A: the practice rubric grid, saved a page at a time.
  await faculty.getByRole('link', { name: 'Practice rubric' }).click();
  const marks = {
    Concept: '4',
    'Planning and execution': '8',
    'Result and interpretation': '7.5',
    Record: '9',
    Conduct: '4',
    Viva: '8',
  };
  for (const [criterion, value] of Object.entries(marks)) {
    await faculty.getByLabel(new RegExp(`^Student 01, ${criterion}, out of`)).fill(value);
  }
  await faculty.getByRole('button', { name: 'Save this page' }).click();
  await expect(faculty.getByText('Saved. The internal marks follow within a minute.')).toBeVisible();

  // The worker works the marks out again (AC-M06-02).
  await faculty.goto(`${course}/marks`);
  const row = faculty.getByRole('row').filter({ hasText: '2501CSE001' });
  // The page streams in after a reload, so each try waits for the cell.
  await expect(async () => {
    await faculty.reload();
    await expect(row.getByText('40.5', { exact: true })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // A student sees only their own breakdown.
  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await openCourse(student);
  await student.getByRole('tab', { name: 'Marks' }).click();
  await expect(student.getByRole('heading', { name: 'Practice · 40.5 of 50' })).toBeVisible();
  await expect(student.getByText('2501CSE002')).toHaveCount(0);

  // The head of department reads the CE report for the department's courses.
  const hod = await signedIn(browser, 'hod@seed.cutm.test');
  await hod.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(hod.getByRole('heading', { name: 'Continuous evaluation' })).toBeVisible();
  await expect(hod.getByRole('row').filter({ hasText: COURSE })).toBeVisible();
});
