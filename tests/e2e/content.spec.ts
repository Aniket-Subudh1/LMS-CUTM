import { expect, test, type Browser, type Page } from '@playwright/test';
import { z } from 'zod';

// M02 T11, M03b T2 and T4. Fixture users come from `npm run db:seed:e2e` and share E2E_PASSWORD (10 §3); storage is RustFS and
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
  // M03b frame: the workspace header names the course; the code, term and section sit above it.
  await expect(page.getByRole('heading', { name: 'Programming in C', exact: true })).toBeVisible();
  return page;
}

test('faculty builds a module, reorders it from the keyboard and publishes a video; a student keeps the progress', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('tab', { name: 'Content' }).click();

  // M03b builder: modules on the left, the chosen module's lessons on the right.
  const unit = `Unit ${run}`;
  await faculty.getByRole('link', { name: 'Add', exact: true }).click();
  const moduleDialog = faculty.getByRole('dialog', { name: 'Add a module' });
  await moduleDialog.getByLabel('Module name').fill(unit);
  await moduleDialog.getByRole('button', { name: 'Add module' }).click();
  await expect(moduleDialog).toBeHidden();

  // AC-M03b-1: the new module (last) moves up one place from the keyboard alone, and stays there after a reload. The
  // page first settles: closing the dialog rewrites the URL and refreshes the list under a drag that started meanwhile.
  await faculty.reload();
  // The drag help and its live region are added once the page is interactive; a key pressed before then is lost.
  await expect(faculty.locator('[id^="DndLiveRegion"]').first()).toBeAttached();
  // The module links; the "Add" link above them carries `?module=` too, with `new=module`.
  const order = () => faculty.locator('aside a[href*="?module="]:not([href*="new="])').allInnerTexts();
  const before = await order();
  const last = before.findIndex((text) => text.includes(unit));
  expect(last).toBe(before.length - 1);
  const handle = faculty.getByRole('button', { name: `Move module: ${unit}` });
  // Each step waits for what a screen reader is told, so no key arrives before the drag has started.
  const told = (text: RegExp) => expect(faculty.getByRole('status').filter({ hasText: text })).toHaveCount(1);
  await handle.focus();
  await handle.press('Space');
  await told(new RegExp(`${unit} is over position ${before.length} of ${before.length}`));
  await faculty.keyboard.press('ArrowUp');
  await told(new RegExp(`${unit} is over position ${before.length - 1} of`));
  await faculty.keyboard.press('Space');
  await told(new RegExp(`${unit} dropped at position ${before.length - 1} of`));
  await expect(async () => {
    await faculty.reload();
    expect((await order()).findIndex((text) => text.includes(unit))).toBe(last - 1);
  }).toPass({ timeout: 15_000 });

  await faculty.locator('aside a[href*="?module="]').filter({ hasText: unit }).click();
  await expect(faculty.getByRole('heading', { name: unit })).toBeVisible();
  await faculty.getByRole('button', { name: 'Add lesson' }).click();
  await faculty.getByRole('menuitem', { name: 'Video' }).click();
  const lessonDialog = faculty.getByRole('dialog', { name: 'Add a video lesson' });
  const title = `Pointers ${run}`;
  await lessonDialog.getByLabel('Title').fill(title);
  // AC-M02-01: the browser sends the file straight to object storage with a presigned PUT.
  await lessonDialog.locator('input[type=file][accept*="video"]').setInputFiles('tests/e2e/fixtures/lecture.mp4');
  await expect(lessonDialog.getByText(/· Uploaded/)).toBeVisible({ timeout: 30_000 });
  await lessonDialog.getByRole('button', { name: 'Add lesson' }).click();
  await expect(lessonDialog).toBeHidden();

  const row = faculty.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('Draft')).toBeVisible();
  await faculty.getByRole('button', { name: 'Publish all' }).click();
  await expect(row.getByText('Published')).toBeVisible();
  // AC-M03b-2: the worker takes a frame of the new video as its thumbnail.
  await expect(async () => {
    await faculty.reload();
    await expect(row.locator('img')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });

  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await student.getByRole('tab', { name: 'Lessons' }).click();
  await student.locator('aside a[href*="?module="]').filter({ hasText: unit }).click();
  // The resume bar may name the same lesson; either link opens it.
  await student
    .getByRole('link', { name: new RegExp(title) })
    .filter({ visible: true })
    .first()
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

test('the course plan is written, its sessions added, edited and deleted, and publishing emails every student', async ({
  browser,
}) => {
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('tab', { name: 'Course plan' }).click();

  // M03b: the plan text and each session are edited in dialogs.
  await faculty.getByRole('button', { name: 'Edit', exact: true }).click();
  const planDialog = faculty.getByRole('dialog', { name: 'How the course will run' });
  await planDialog.locator('.ProseMirror').click();
  await faculty.keyboard.press('ControlOrMeta+a');
  await faculty.keyboard.type(`Two lectures and one lab each week (run ${run}).`);
  await planDialog.getByRole('button', { name: 'Save' }).click();
  await expect(planDialog.getByText('Plan saved.')).toBeVisible();
  await expect(planDialog).toBeHidden();

  // AC-M01b-09: the catalogue course's session plan, dated on Mondays, Wednesdays and Fridays.
  await faculty.getByRole('button', { name: 'Fill from the session plan' }).click();
  const fill = faculty.getByRole('dialog', { name: /^Fill from the course/ });
  await fill.getByLabel('First class').fill('2026-11-02');
  // A day is a chip (a label around a hidden checkbox); a person clicks the chip.
  for (const day of ['Mon', 'Wed', 'Fri']) {
    await fill
      .locator('label')
      .filter({ hasText: new RegExp(`^${day}$`) })
      .click();
    await expect(fill.getByRole('checkbox', { name: day })).toBeChecked();
  }
  const replace = fill.getByRole('checkbox', { name: /^Replace the/ });
  if (await replace.count()) await replace.check();
  await fill.getByRole('button', { name: 'Fill sessions' }).click();
  await expect(fill.getByText('Sessions filled.')).toBeVisible();
  await expect(fill).toBeHidden();
  await expect(faculty.getByText('Structure of a C program').first()).toBeVisible();

  const session = async (date: string, topic: string) => {
    await faculty.getByRole('button', { name: 'Add session' }).click();
    const add = faculty.getByRole('dialog', { name: 'Add a session' });
    await add.getByLabel('Date').fill(date);
    await add.getByLabel('Topic').fill(topic);
    await add.getByRole('button', { name: 'Add session' }).click();
    await expect(add).toBeHidden();
    await expect(faculty.getByText(topic, { exact: true })).toBeVisible();
  };
  await session('2026-11-02', `Pointers ${run}`);
  await session('2026-11-03', `Spare ${run}`);

  await faculty.getByRole('button', { name: `Actions for Pointers ${run}` }).click();
  await faculty.getByRole('menuitem', { name: 'Edit session' }).click();
  const edit = faculty.getByRole('dialog', { name: 'Edit session' });
  await edit.getByLabel('Topic').fill(`Pointers and arrays ${run}`);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(faculty.getByText(`Pointers and arrays ${run}`, { exact: true })).toBeVisible();

  await faculty.getByRole('button', { name: `Actions for Spare ${run}` }).click();
  await faculty.getByRole('menuitem', { name: 'Delete session' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Delete session' }).click();
  await expect(faculty.getByText(`Spare ${run}`, { exact: true })).toHaveCount(0);

  // Earlier runs left plan emails with the same subject; start from an empty inbox.
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  await faculty.getByRole('button', { name: /^Publish (plan|version \d+)$/ }).click();
  const confirm = faculty.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /^Publish/ }).click();
  // Once published, the publish bar gives way to the version line (M03b).
  await expect(faculty.getByText(/^Version \d+ was published /)).toBeVisible();
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
