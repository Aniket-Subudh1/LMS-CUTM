import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';

// M08 T9: the whole exchange on the e2e seed's closed term 2025-EVEN, whose one course is LAB0201 (practice only, every
// student's rubric filled: 40.5 of 50). The seed starts that term over each time; Playwright starts the worker that
// works the grade sheets out.
const password = process.env.E2E_PASSWORD ?? '';

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return page;
}

test('an admin locks a course, sends and brings back its marks and publishes; a student sees the sheet', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, 'admin@seed.cutm.test');
  await admin.getByRole('link', { name: 'Exams' }).click();
  await admin.getByRole('combobox', { name: 'Term' }).selectOption({ label: '2025-EVEN · Even semester 2025-26' });
  await expect(admin).toHaveURL(/term=[0-9a-f]{24}/);
  await admin
    .getByRole('row', { name: /^2025 / })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(admin.getByRole('heading', { name: '2025', exact: true })).toBeVisible();

  // Step 1: the course is complete, so it locks without a reason.
  const course = admin.getByRole('row', { name: /LAB0201 · Programming Lab/ });
  await expect(course.getByText('Ready to lock')).toBeVisible();
  await course.getByRole('button', { name: 'Lock' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Lock' }).click();
  await expect(course.getByText(/^Locked /)).toBeVisible();

  // Step 2: the file for the exam section, one row per student.
  const downloading = admin.waitForEvent('download');
  await admin.getByRole('link', { name: 'Download the file (CSV)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('internal-marks-2025-even-2025.csv');
  const lines = (await readFile(await download.path(), 'utf8')).split('\r\n');
  expect(lines).toHaveLength(21);
  expect(lines[1]).toBe('2501CSE001,Student 01,LAB0201,2025-EVEN,,40.5,,,,');

  // Step 3: the same file back with the practice examiner's 45 filled in.
  const filled = [lines[0], ...lines.slice(1).map((line) => line.replace(/,,,,$/, ',,,45,'))].join('\n');
  await admin
    .getByLabel('The exam section’s file')
    .setInputFiles({ name: 'marks.csv', mimeType: 'text/csv', buffer: Buffer.from(filled) });
  await admin.getByRole('button', { name: 'Upload' }).click();
  await expect(admin.getByText('Marks saved.')).toBeVisible();

  // Step 4: worked out in the worker (the page follows it), then published.
  await admin.getByRole('button', { name: 'Work them out' }).click();
  const publish = admin.getByRole('button', { name: 'Publish 20 grade sheets' });
  await expect(publish).toBeVisible({ timeout: 60_000 });
  await publish.click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Publish 20 grade sheets' }).click();
  await expect(admin.getByText('Published · 20')).toBeVisible({ timeout: 30_000 });

  // 40.5 + 45 = 85.5, rounded up once to 86 %: A+, 9 points.
  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await student.getByRole('link', { name: 'Results' }).click();
  await expect(student.getByRole('heading', { name: '2025-EVEN · Even semester 2025-26' })).toBeVisible();
  await expect(student.getByText('LAB0201 · Programming Lab', { exact: true })).toBeVisible();
  await expect(student.getByText('86% · 9 points')).toBeVisible();
  await expect(student.getByText('A+', { exact: true })).toBeVisible();
});
