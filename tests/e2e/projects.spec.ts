import { expect, test, type Browser, type Page } from '@playwright/test';

// M07 T10, on the task tracker only: there is no GitHub in CI. Fixture users come from `npm run db:seed:e2e` (10 §3);
// Playwright starts the worker that works the internal marks out. A student is in one project at a time, so each run
// teams up the first student still free: a fresh seed has twenty.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1014 · Gender, Human Rights and Ethics · 2026-ODD · A';
const run = String(Date.now()).slice(-6);

// A date input's value, `days` from today in IST.
const day = (days: number) => new Date(Date.now() + 19_800_000 + days * 86_400_000).toISOString().slice(0, 10);

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  return page;
}

async function openProjects(page: Page): Promise<void> {
  await page.goto(`/courses?q=${encodeURIComponent(COURSE)}`);
  await page.getByRole('link', { name: COURSE }).click();
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test('a teacher sets a team tasks and marks a review; the student moves a task and sees the project internal', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const title = `Campus survey ${run}`;
  const tasks = [`Interview residents ${run}`, `Write the report ${run}`];

  // P1: the teacher makes a project of one free student.
  const faculty = await signedIn(browser, 'faculty2@seed.cutm.test');
  await openProjects(faculty);
  await faculty.getByRole('link', { name: 'New project' }).click();
  const dialog = faculty.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  const free = dialog.getByRole('checkbox').first();
  const name = /Student \d\d/.exec(await free.locator('..').innerText())?.[0];
  expect(name).toBeTruthy();
  await free.check();
  await dialog.getByLabel('Starts on', { exact: true }).fill(day(-7));
  await dialog.getByLabel('Due on', { exact: true }).fill(day(60));
  await dialog.getByRole('button', { name: 'Create the project' }).click();
  await expect(dialog).toBeHidden();
  await faculty.getByRole('link', { name: title }).click();
  await expect(faculty).toHaveURL(/\/projects\/[0-9a-f]{24}$/);
  const project = new URL(faculty.url()).pathname;

  // P3 A: two tasks for that student; each starts in Backlog.
  for (const task of tasks) {
    await faculty.getByRole('link', { name: 'New task' }).click();
    const form = faculty.getByRole('dialog', { name: 'New task' });
    await form.getByLabel('Task', { exact: true }).fill(task);
    await form.getByLabel('Due on', { exact: true }).fill(day(14));
    await form.getByRole('button', { name: 'Add the task' }).click();
    await expect(form).toBeHidden();
  }
  for (const task of tasks) {
    await expect(faculty.getByRole('region', { name: 'Backlog' }).getByText(task)).toBeVisible();
  }

  // The student starts their task and sends it for review; only the teacher may mark it done (07 §13).
  const student = await signedIn(browser, `student${name?.slice(-2)}@seed.cutm.test`);
  await openProjects(student);
  await expect(student.getByRole('heading', { name: 'Your project' })).toBeVisible();
  await student.getByRole('link', { name: 'Open' }).click();
  await expect(student).toHaveURL(project);
  const card = (page: Page) => page.getByRole('article').filter({ hasText: tasks[0] });
  await card(student).getByRole('button', { name: 'Start' }).click();
  await expect(student.getByRole('region', { name: 'In progress' }).getByText(tasks[0])).toBeVisible();
  await card(student).getByRole('button', { name: 'Send for review' }).click();
  await expect(student.getByRole('region', { name: 'Review' }).getByText(tasks[0])).toBeVisible();
  await expect(card(student).getByRole('button', { name: 'Mark done' })).toHaveCount(0);

  // The teacher marks it done, and the deadlines follow.
  await faculty.reload();
  await card(faculty).getByRole('button', { name: 'Mark done' }).click();
  await expect(faculty.getByRole('region', { name: 'Done' }).getByText(tasks[0])).toBeVisible();
  const deadlines = faculty.getByRole('row').filter({ hasText: name ?? '' });
  await expect(deadlines.getByRole('cell')).toHaveText([name ?? '', '2', '1', '1', '0', '100%']);

  // P4: a review, marked on the project rubric.
  await faculty.getByRole('link', { name: 'New review' }).click();
  const review = faculty.getByRole('dialog', { name: 'New review' });
  await review.getByLabel('Title', { exact: true }).fill(`Mid-semester review ${run}`);
  await review.getByLabel('Date', { exact: true }).fill(day(0));
  await review.getByRole('button', { name: 'Add the review' }).click();
  await expect(review).toBeHidden();
  await faculty
    .getByRole('listitem')
    .filter({ hasText: `Mid-semester review ${run}` })
    .getByRole('link', { name: 'Mark' })
    .click();
  const marks = {
    Relevance: '4',
    Literature: '4',
    Methodology: '8',
    'Analysis and results': '7.5',
    Interpretation: '9',
    Report: '8',
  };
  for (const [criterion, value] of Object.entries(marks)) {
    await faculty.getByLabel(new RegExp(`^${name}, ${criterion}, out of`)).fill(value);
  }
  await faculty.getByRole('button', { name: 'Save the marks' }).click();
  await expect(faculty.getByText('Saved. The project internals follow within a minute.')).toBeVisible();

  // AC-M07-05: the review becomes the student's project internal once the worker has worked it out.
  await student.goto(project.replace(/\/projects\/.*$/, '/marks'));
  await expect(async () => {
    await student.reload();
    await expect(student.getByRole('heading', { name: 'Project · 40.5 of 50' })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
});
