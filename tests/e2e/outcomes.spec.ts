import { expect, test, type Browser, type Page } from '@playwright/test';

// M09 T7. `npm run db:seed:e2e` gives CUTM1602 A a published quiz with one question per outcome and end-semester marks,
// and starts its attainment record over; Playwright starts the worker that works it out. Earlier specs publish their
// own tests on this class, so the values are checked for being there, not for the seed's numbers.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';

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

const card = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('a teacher works attainment out, the head of department reads it and the programme report, a student does not', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  const course = await openCourse(faculty);
  await faculty.getByRole('tab', { name: 'Outcomes' }).click();
  const attainment = card(faculty, 'Attainment');
  await attainment.getByRole('button', { name: /^Work it out (now|again)$/ }).click();
  await expect(attainment.getByText('Queued. The new values show here within a minute.')).toBeVisible();

  // Only "Work it out again" names who asked, so the name shows this run (06 §6).
  await expect(async () => {
    await faculty.reload();
    await expect(faculty.getByText(/by Pradeep Sahoo with: target \d+ %/)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  const co1 = card(faculty, 'Attainment').getByRole('row').filter({ hasText: 'Explain the basic constructs of C.' });
  await expect(co1.getByRole('progressbar', { name: /^CO1: [\d.]+ of 3$/ })).toBeVisible();
  await expect(co1.getByText(/^(Met|Not met)$/)).toBeVisible();
  // Mock-up A2: the grid it was worked out with, and each outcome's value under it (CO1 maps to PO1).
  await expect(card(faculty, 'Outcomes reached').getByRole('row', { name: /^Attainment [\d.]+ / })).toBeVisible();

  // The head of department reads it without the button, and the programme report lists the course.
  const hod = await signedIn(browser, 'hod@seed.cutm.test');
  await hod.goto(`${course}/outcomes`);
  await expect(hod.getByText(/by Pradeep Sahoo with: target/)).toBeVisible();
  await expect(hod.getByRole('button', { name: /^Work it out/ })).toHaveCount(0);
  await hod.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(hod.getByRole('heading', { name: 'Continuous evaluation' })).toBeVisible();
  await hod.getByRole('tab', { name: 'Attainment' }).click();
  await expect(hod.getByRole('heading', { name: 'Programme attainment' })).toBeVisible();
  const row = hod.getByRole('row').filter({ hasText: 'CUTM1602 · Programming in C' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Not worked out yet')).toHaveCount(0);
  await expect(hod.getByRole('row', { name: /^Programme [\d.]+ / })).toBeVisible();

  // A student sees the outcomes as before, without attainment (09 §2).
  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await openCourse(student);
  await student.getByRole('tab', { name: 'Outcomes' }).click();
  await expect(student.getByRole('heading', { name: 'Course outcomes' })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'Attainment', exact: true })).toHaveCount(0);
});
