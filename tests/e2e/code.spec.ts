import { expect, test, type Browser, type Page } from '@playwright/test';

// M04b phase D (TP-09). faculty1 (from `npm run db:seed:e2e`) builds a coding test on CUTM1602 with one code question,
// a visible test and a hidden one; student04 runs the sample test and hands in; the worker runs every test and the
// grader sees the hidden one pass. Code runs on tests/e2e/fake-runner.ts, which prints each test's input, so the tests
// here expect their input back. Each run makes its own test, so runs never collide.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);
const TEST = `Coding test ${run}`;
const ist = (minutes: number) => new Date(Date.now() + (minutes + 330) * 60_000).toISOString().slice(0, 16);

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/courses');
  await page.getByLabel('Search courses', { exact: true }).fill(COURSE);
  await page.getByLabel('Search courses', { exact: true }).press('Enter');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === COURSE);
  await page.getByRole('link', { name: COURSE }).click();
  await page.getByRole('tab', { name: 'Assessments' }).click();
  await expect(page.getByRole('heading', { name: 'Assessments', exact: true })).toBeVisible();
  return page;
}

test('a teacher sets a code question; a student runs the sample test and hands in; every test is marked', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('link', { name: 'New assessment' }).click();
  const create = faculty.getByRole('dialog', { name: 'New assessment' });
  await create.locator('label', { hasText: 'Coding test' }).click();
  await create.getByLabel('Title').fill(TEST);
  await create.getByLabel('Opens').fill(ist(-5));
  await create.getByLabel('Closes').fill(ist(60));
  await create.getByRole('button', { name: 'Create and add questions' }).click();
  await expect(faculty).toHaveURL(/\/assessments\/[a-f\d]{24}\/edit$/);
  const builder = faculty.url();

  await faculty.getByRole('link', { name: 'Code', exact: true }).click();
  const question = faculty.getByRole('dialog', { name: /· Code$/ });
  await question.locator('.ProseMirror').first().click();
  await faculty.keyboard.type('Print the line you read.');
  await question.getByLabel('Marks', { exact: true }).fill('5');
  await question.getByRole('checkbox', { name: /CO1/ }).check();
  await expect(question.getByRole('checkbox', { name: 'C (GCC 9.2.0)' })).toBeChecked();
  await question.getByLabel('Test 1 input').fill('hello');
  await question.getByLabel('Test 1 expected output').fill('hello');
  await question.getByLabel('Test 2 input').fill('world');
  await question.getByLabel('Test 2 expected output').fill('world');
  // The second test starts hidden.
  await expect(question.locator('input[name="caseHidden[]"]').nth(1)).toBeChecked();
  await question.getByRole('button', { name: 'Save question' }).click();
  await expect(question).toBeHidden();
  await faculty.getByRole('button', { name: 'Publish' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(faculty.getByRole('link', { name: /Hand-ins/ })).toBeVisible();

  const student = await signedIn(browser, 'student04@seed.cutm.test');
  await student.getByRole('link', { name: TEST }).click();
  await student.getByRole('checkbox', { name: /I have read the rules/ }).check();
  await student.getByRole('button', { name: 'Start coding test' }).click();
  await expect(student).toHaveURL(/\/attempt$/);
  await expect(student.getByText('· 1 hidden test', { exact: false })).toBeVisible();
  // TP-09 (mock-up B3): the editor, the runs left and the sample test.
  const editor = student.getByRole('textbox', { name: 'Code for question 1' });
  await editor.click();
  await student.keyboard.type('puts(gets());');
  await expect(student.getByText('10 of 10', { exact: true })).toBeVisible();
  await student.getByRole('button', { name: 'Run sample tests' }).click();
  await expect(student.getByText('· 1 of 1 passed')).toBeVisible({ timeout: 30_000 });
  await expect(student.getByText('9 of 10', { exact: true })).toBeVisible();
  await student.getByRole('button', { name: 'Review answers' }).click();
  await student.getByRole('button', { name: 'Hand in now' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Hand in' }).click();
  await expect(student).toHaveURL(/\/assessments\/[a-f\d]{24}$/);

  // The worker runs both tests; the grader sees the hidden one pass and the full marks.
  await faculty.goto(builder.replace(/\/edit$/, '/grade'));
  await faculty
    .getByRole('row', { name: /Student 04/ })
    .getByRole('link', { name: /Open|Grade/ })
    .click();
  await expect(faculty).toHaveURL(/\/grade\/[a-f\d]{24}$/);
  await expect(async () => {
    await faculty.reload();
    await expect(faculty.getByText('Code tested on every test', { exact: false })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(faculty.locator('b.text-xl')).toHaveText(/^5\s*\/\s*5$/);
  const hidden = faculty.locator('li', { hasText: 'Test 2' });
  await expect(hidden.getByText('Hidden')).toBeVisible();
  await expect(hidden.getByText(/Passed/)).toBeVisible();
});
