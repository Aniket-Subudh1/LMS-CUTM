import { expect, test, type Browser, type Page } from '@playwright/test';
import { z } from 'zod';

// M02 T11. Fixture users come from `npm run db:seed:e2e` and share E2E_PASSWORD (10 §3); storage is RustFS and
// mail is Mailpit from the compose stack, and Playwright starts the worker that transcodes and sends the email.
const password = process.env.E2E_PASSWORD ?? '';
const MAILPIT = 'http://localhost:8025';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);

const MessageList = z.object({
  messages: z.array(z.object({ ID: z.string(), Subject: z.string(), To: z.array(z.object({ Address: z.string() })) })),
});
const Message = z.object({ HTML: z.string() });

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  // My courses shows ten a page and earlier runs leave offerings behind, so search for the seeded one.
  await page.goto('/courses');
  await page.getByLabel('Search courses', { exact: true }).fill(COURSE);
  await page.getByLabel('Search courses', { exact: true }).press('Enter');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === COURSE);
  await page.getByRole('link', { name: COURSE }).click();
  await expect(page.getByRole('heading', { name: COURSE })).toBeVisible();
  return page;
}

test('faculty publishes a video lesson; a student watches part of it and keeps the progress', async ({ browser }) => {
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('tab', { name: 'Content' }).click();

  const unit = `Unit ${run}`;
  await faculty.getByRole('button', { name: 'Add module' }).click();
  const moduleDialog = faculty.getByRole('dialog', { name: 'Add a module' });
  await moduleDialog.getByLabel('Module name').fill(unit);
  await moduleDialog.getByRole('button', { name: 'Add module' }).click();
  await expect(moduleDialog).toBeHidden();

  const card = faculty.getByRole('listitem').filter({ has: faculty.getByRole('heading', { name: unit }) });
  await card.getByRole('button', { name: 'Lesson', exact: true }).click();
  const lessonDialog = faculty.getByRole('dialog', { name: 'Add a lesson' });
  const title = `Pointers ${run}`;
  await lessonDialog.getByLabel('Title').fill(title);
  // AC-M02-01: the browser sends the file straight to object storage with a presigned PUT.
  await lessonDialog.locator('input[type=file][accept*="video"]').setInputFiles('tests/e2e/fixtures/lecture.mp4');
  await expect(lessonDialog.getByText(/· Uploaded/)).toBeVisible({ timeout: 30_000 });
  await lessonDialog.getByRole('button', { name: 'Add lesson' }).click();
  await expect(lessonDialog).toBeHidden();

  const row = card.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('Draft')).toBeVisible();
  await row.getByRole('button', { name: 'Publish' }).click();
  await expect(row.getByText('Published')).toBeVisible();

  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await student.getByRole('tab', { name: 'Lessons' }).click();
  // Next keeps the Overview mounted but hidden, and its "Start" button names the same lesson.
  await student
    .getByRole('link', { name: new RegExp(title) })
    .filter({ visible: true })
    .click();
  await expect(student.getByRole('heading', { name: title })).toBeVisible();
  const video = student.locator('video');
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await student.waitForTimeout(5_000);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  // The pause sends the progress beacon in the background; reload until the saved progress shows.
  await expect(async () => {
    await student.reload();
    await expect(student.getByText(/\b[1-9]\d?% watched/)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
});

test('publishing the course plan emails every student all five sections', async ({ browser }) => {
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('tab', { name: 'Course plan' }).click();

  await faculty.locator('#plan .ProseMirror').click();
  await faculty.keyboard.press('ControlOrMeta+a');
  await faculty.keyboard.type(`Two lectures and one lab each week (run ${run}).`);
  await faculty.getByRole('button', { name: 'Save plan' }).click();
  await expect(faculty.getByText('Plan saved.')).toBeVisible();

  // AC-M01b-09: the catalogue course's session plan, dated on Mondays, Wednesdays and Fridays.
  const card = faculty.locator('form').filter({ has: faculty.getByRole('button', { name: 'Fill sessions' }) });
  await card.getByLabel('First class').fill('2026-11-02');
  for (const day of ['Mon', 'Wed', 'Fri']) await card.getByRole('checkbox', { name: day }).check({ force: true });
  const replace = card.getByRole('checkbox', { name: /^Replace the/ });
  if (await replace.count()) await replace.check();
  await card.getByRole('button', { name: 'Fill sessions' }).click();
  await expect(faculty.getByText('Sessions filled.')).toBeVisible();
  await expect(faculty.locator('input[name=topic_0]')).toHaveValue('Structure of a C program');

  const blank = await faculty
    .locator('input[name^=topic_]')
    .evaluateAll((inputs) => inputs.findIndex((input) => input instanceof HTMLInputElement && input.value === ''));
  await faculty.locator(`input[name=date_${blank}]`).fill('2026-11-02');
  await faculty.locator(`input[name=topic_${blank}]`).fill(`Pointers and arrays ${run}`);
  await faculty.getByRole('button', { name: 'Save sessions' }).click();
  await expect(faculty.getByText('Sessions saved.')).toBeVisible();

  // Earlier runs left plan emails with the same subject; start from an empty inbox.
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  await faculty
    .locator('#publish')
    .getByRole('button', { name: /^Publish/ })
    .click();
  const confirm = faculty.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /^Publish/ }).click();
  await expect(faculty.getByText('Published. Students are being notified.')).toBeVisible();

  // AC-M02-04: the student's copy arrives with the calendar, syllabus, objectives, COs and POs.
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const { messages } = MessageList.parse(await (await fetch(`${MAILPIT}/api/v1/messages`)).json());
        id = messages.find(
          (m) =>
            m.Subject === 'Course plan: CUTM1602 Programming in C' &&
            m.To.some((t) => t.Address === 'student01@seed.cutm.test'),
        )?.ID;
        return id;
      },
      { timeout: 20_000 },
    )
    .toBeTruthy();
  const { HTML } = Message.parse(await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json());
  for (const section of ['Course calendar', 'Syllabus', 'Course objectives', 'Course outcomes', 'Program outcomes']) {
    expect(HTML).toContain(`>${section}</h2>`);
  }
  expect(HTML).toContain(`Pointers and arrays ${run}`);
  expect(HTML).toContain('Structure of a C program');
  expect(HTML).toContain('Basics of C (2+4+2 hours)');
});
