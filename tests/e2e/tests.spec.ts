import { expect, test, type Browser, type Page } from '@playwright/test';
import { z } from 'zod';

// M04b phase A (TP-01–TP-04). faculty1 (from `npm run db:seed:e2e`) makes a standalone test and shares a link for
// guests; an outside candidate registers with an email code read from Mailpit, passes the lobby and hands in; the
// owner sees the hand-in. Each run makes its own test and guest, so runs never collide.
const password = process.env.E2E_PASSWORD ?? '';
const MAILPIT = 'http://localhost:8025';
const run = String(Date.now()).slice(-6);
const TEST = `Placement test ${run}`;
const GUEST = `riya.${run}@example.com`;
const ist = (minutes: number) => new Date(Date.now() + (minutes + 330) * 60_000).toISOString().slice(0, 16);

const MessageList = z.object({
  messages: z.array(z.object({ Subject: z.string(), To: z.array(z.object({ Address: z.string() })) })),
});

// Next keeps the previous page mounted but hidden; a label can match its fields too.
const field = (page: Page, label: string | RegExp, options?: { exact: boolean }) =>
  page.getByLabel(label, options).filter({ visible: true });

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await field(page, 'Email', { exact: true }).fill(email);
  await field(page, 'Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return page;
}

// The guest's code is the first six characters of the email's subject (TP-03).
async function emailedCode(to: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const { messages } = MessageList.parse(await (await fetch(`${MAILPIT}/api/v1/messages`)).json());
        code = messages
          .find((m) => m.To.some((t) => t.Address === to) && /^\d{6} is your code/.test(m.Subject))
          ?.Subject.slice(0, 6);
        return code;
      },
      { timeout: 20_000 },
    )
    .toBeTruthy();
  return code ?? '';
}

test('staff share a standalone test with guests; a guest registers by email code, passes the lobby and hands in', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');

  // TP-02: a test outside any course, made from the Tests page.
  await faculty.getByRole('link', { name: 'Tests', exact: true }).click();
  await expect(faculty.getByRole('heading', { name: 'Tests', exact: true })).toBeVisible();
  await faculty.getByRole('link', { name: 'New test' }).click();
  const create = faculty.getByRole('dialog', { name: 'New test' });
  await create.getByLabel('Title').fill(TEST);
  await create.getByLabel('Opens').fill(ist(-5));
  await create.getByLabel('Closes').fill(ist(60));
  await create.getByRole('button', { name: 'Create and add questions' }).click();
  await expect(faculty).toHaveURL(/\/tests\/[a-f\d]{24}\/edit$/);
  await expect(faculty.getByRole('heading', { name: TEST })).toBeVisible();

  await faculty.getByRole('link', { name: 'One answer', exact: true }).click();
  const question = faculty.getByRole('dialog', { name: /· One answer$/ });
  // Outside a course there are no course outcomes to tag.
  await expect(question.getByText('Course outcomes')).toHaveCount(0);
  await question.locator('.ProseMirror').click();
  await faculty.keyboard.type('Which of these is a valid identifier in C?');
  await question.getByLabel('Marks', { exact: true }).fill('2');
  await question.getByPlaceholder('Option 1').fill('2nd_value');
  await question.getByPlaceholder('Option 2').fill('_total');
  await question.getByRole('radio', { name: 'Option 2 is correct' }).check();
  await question.getByRole('button', { name: 'Save question' }).click();
  await expect(question).toBeHidden();
  await faculty.getByRole('button', { name: 'Publish' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(faculty.getByRole('link', { name: /Hand-ins/ })).toBeVisible();

  // TP-01: a link for guests, with an access code.
  await faculty.getByRole('link', { name: 'New link' }).click();
  const make = faculty.getByRole('dialog', { name: 'New share link' });
  await make.getByLabel('Name').fill('Applicants');
  await make.locator('label', { hasText: 'Outside people register' }).click();
  await expect(make.getByRole('radio', { name: /Guests/ })).toBeChecked();
  await make.getByLabel('Access code').fill('CSE-26');
  await make.getByRole('button', { name: 'Make the link' }).click();
  await expect(make).toBeHidden();
  const url = await faculty.getByRole('textbox', { name: 'Address of Applicants' }).inputValue();
  expect(url).toMatch(/\/t\/[\w-]{24}$/);

  // TP-03: the guest registers with name and email, and confirms the emailed code.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  await expect(guest.getByRole('heading', { name: TEST })).toBeVisible();
  await field(guest, 'Access code').fill('CSE-26');
  await field(guest, 'Full name').fill('Riya Patnaik');
  await field(guest, 'Email', { exact: true }).fill(GUEST);
  await guest.getByRole('checkbox', { name: /keeps my name, email and answers/ }).check();
  await guest.getByRole('button', { name: 'Email me a code' }).click();
  await expect(guest.getByText('We sent a 6-digit code to', { exact: false })).toBeVisible();
  await field(guest, 'Code', { exact: true }).fill(await emailedCode(GUEST));
  await guest.getByRole('button', { name: 'Confirm and continue' }).click();

  // TP-04: the lobby checks the device; Start needs the rules accepted.
  await expect(guest).toHaveURL(/\/tests\/[a-f\d]{24}$/);
  await expect(guest.getByRole('heading', { name: 'Device check' })).toBeVisible();
  await expect(guest.getByText('2 of 2 ready')).toBeVisible({ timeout: 15_000 });
  // A candidate's sidebar has their tests and no dashboard.
  await expect(guest.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await guest.getByRole('checkbox', { name: /I have read the rules/ }).check();
  await guest.getByRole('button', { name: 'Start quiz' }).click();
  await expect(guest).toHaveURL(/\/tests\/[a-f\d]{24}\/attempt$/);
  await guest.getByRole('radio', { name: '_total' }).check();
  await expect(guest.getByText('All answers saved').first()).toBeVisible({ timeout: 15_000 });
  await guest.getByRole('button', { name: 'Submit' }).click();
  await guest.getByRole('alertdialog').getByRole('button', { name: 'Hand in' }).click();
  await expect(guest).toHaveURL(/\/tests\/[a-f\d]{24}$/);
  await expect(guest.getByText('Your answers are handed in.', { exact: false })).toBeVisible();

  // The owner sees one person joined through the link, and the hand-in.
  await faculty.reload();
  await expect(faculty.getByText(/1 joined/)).toBeVisible();
  await faculty.getByRole('link', { name: /Hand-ins/ }).click();
  await expect(faculty.getByText('Riya Patnaik')).toBeVisible();
});
