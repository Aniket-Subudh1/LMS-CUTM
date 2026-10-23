import { expect, test, type Browser, type Page } from '@playwright/test';

// M03 T10. The LiveKit server runs with livekit.yaml, whose webhooks reach this build on port 3100 (11 §3.1);
// Chromium fakes the camera and microphone (playwright.config.ts). Fixture users come from `npm run db:seed:e2e`.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);

// The IST date and time the schedule dialog takes.
const ist = (ms: number) => new Date(ms + 330 * 60_000).toISOString();

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
  // M03b frame: the workspace header names the course; the code, term and section sit above it.
  await expect(page.getByRole('heading', { name: 'Programming in C', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Live' }).click();
  await expect(page.getByRole('heading', { name: 'Upcoming classes', exact: true })).toBeVisible();
  return page;
}

test('faculty runs a live class; a student joins and is marked present', async ({ browser }) => {
  test.setTimeout(180_000);
  const title = `Pointers ${run}`;
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('button', { name: 'Schedule a class' }).click();
  const schedule = faculty.getByRole('dialog', { name: 'Schedule a live class' });
  const start = Date.now() + 5 * 60_000;
  await schedule.getByLabel('What is the class about?').fill(title);
  await schedule.getByLabel('Date').fill(ist(start).slice(0, 10));
  await schedule.getByLabel('Starts at').fill(ist(start).slice(11, 16));
  await schedule.getByText('I take attendance in class').click();
  await schedule.getByRole('button', { name: 'Schedule class' }).click();
  await expect(schedule).toBeHidden();
  const row = faculty.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('You can start it now')).toBeVisible();

  // The student waits on the class page; "Join class" appears there when the class starts.
  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await student.getByRole('link', { name: title }).click();
  await expect(student.getByText(/Starts today at/)).toBeVisible();

  await row.getByRole('link', { name: 'Start class' }).click();
  await faculty.getByRole('button', { name: 'Start class' }).click();
  // M03b: the class opens in a tab of its own, like a video call; the class page stays for attendance.
  const join = async (page: Page) => {
    const [room] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: 'Join class' }).click({ timeout: 60_000 }),
    ]);
    // The room's own controls (M03b "A · Stage and side panel") show once it has connected.
    await expect(room.getByRole('button', { name: 'People', exact: true })).toBeVisible({ timeout: 30_000 });
    return room;
  };
  const facultyRoom = await join(faculty);
  const studentRoom = await join(student);

  // M03b: the student raises a hand; the teacher is told and lowers it.
  await studentRoom.getByRole('button', { name: 'Raise your hand' }).click();
  await expect(studentRoom.getByRole('button', { name: 'Lower your hand (1 in line)' })).toBeVisible({
    timeout: 15_000,
  });
  const notice = facultyRoom.getByRole('status').filter({ hasText: 'Student 01 raised a hand' });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await notice.getByRole('button', { name: 'Lower' }).click();
  await expect(studentRoom.getByRole('button', { name: 'Raise your hand' })).toBeVisible({ timeout: 15_000 });

  // ATT-01, decision 2: the student who joined starts ticked present; the teacher saves.
  await expect(async () => {
    await faculty.reload();
    await faculty.getByRole('button', { name: 'Take attendance' }).click();
    const sheet = faculty.getByRole('dialog', { name: 'Take attendance' });
    const student01 = sheet.getByRole('listitem').filter({ hasText: 'Student 01' });
    await expect(student01.getByRole('radio', { name: 'Present' })).toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const sheet = faculty.getByRole('dialog', { name: 'Take attendance' });
  await sheet.getByRole('button', { name: 'Save attendance' }).click();
  await expect(sheet).toBeHidden();
  await expect(facultyRoom.getByRole('button', { name: 'People', exact: true })).toBeVisible();

  await faculty.getByRole('button', { name: 'End class' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'End class' }).click();
  // Ending the class closes the room; the student's class tab says so and leads to their result.
  await expect(studentRoom.getByRole('heading', { name: /class has ended/ })).toBeVisible({ timeout: 30_000 });
  await studentRoom.getByRole('link', { name: 'Open the class page' }).click();
  await expect(
    studentRoom.getByRole('heading', { name: 'Your attendance', exact: true }).filter({ visible: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await faculty.reload();
    await expect(faculty.getByText('Average time in class')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const attendance = faculty.getByRole('row').filter({ hasText: 'Student 01' });
  await expect(attendance.getByText('present', { exact: true })).toBeVisible();
});
