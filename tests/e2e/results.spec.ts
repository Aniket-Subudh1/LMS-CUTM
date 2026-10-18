import { expect, test, type Browser, type Page } from '@playwright/test';

// M04b phase E (TP-11, TP-12). faculty1 (from `npm run db:seed:e2e`) sets a quiz on CUTM1602 to show each person's
// marks at once, with the right answers, explanations, a leaderboard, a band and certificates from 60 %; student07
// hands in, reads the result at once and downloads a certificate that anyone can then check; the results page works out
// the analysis and exports it to Excel. The files are made by the worker and stored in the e2e bucket (RustFS). Each run
// makes its own quiz, so runs never collide.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);
const QUIZ = `Results quiz ${run}`;
const ist = (minutes: number) => new Date(Date.now() + (minutes + 330) * 60_000).toISOString().slice(0, 16);

// A made file's link answers with a redirect to storage; the file itself comes from there.
async function download(page: Page, name: string): Promise<Buffer> {
  const link = page.getByRole('link', { name, exact: true });
  await expect(link).toBeVisible({ timeout: 60_000 });
  const href = (await link.getAttribute('href')) ?? '';
  expect(href).toMatch(/^\/api\/files\/test-file\//);
  const redirect = await page.request.get(href, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  return (await page.request.get(redirect.headers()['location'] ?? '')).body();
}

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

test('a quiz shows each person their marks at once, with answers and a band; the results page analyses it', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');
  await faculty.getByRole('link', { name: 'New assessment' }).click();
  const create = faculty.getByRole('dialog', { name: 'New assessment' });
  await create.getByLabel('Title').fill(QUIZ);
  await create.getByLabel('Opens').fill(ist(-5));
  await create.getByLabel('Closes').fill(ist(60));
  await create.getByRole('button', { name: 'Create and add questions' }).click();
  await expect(faculty).toHaveURL(/\/assessments\/[a-f\d]{24}\/edit$/);
  const builder = faculty.url();

  await faculty.getByRole('link', { name: 'One answer', exact: true }).click();
  const question = faculty.getByRole('dialog', { name: /· One answer$/ });
  await question.locator('.ProseMirror').first().click();
  await faculty.keyboard.type('Which traversal of a BST gives sorted order?');
  await question.getByLabel('Marks', { exact: true }).fill('2');
  await question.getByRole('checkbox', { name: /CO1/ }).check();
  await question.getByPlaceholder('Option 1').fill('Preorder');
  await question.getByPlaceholder('Option 2').fill('Inorder');
  await question.getByRole('radio', { name: 'Option 2 is correct' }).check();
  await question.getByText('Explanation (optional)').click();
  await question.locator('.ProseMirror').nth(1).click();
  await faculty.keyboard.type('Inorder visits left, root, right.');
  await question.getByRole('button', { name: 'Save question' }).click();
  await expect(question).toBeHidden();

  // TP-11: the result rules.
  await faculty.getByRole('link', { name: 'Edit' }).nth(1).click();
  const rules = faculty.getByRole('dialog', { name: 'Results' });
  await rules.getByRole('radio', { name: /Each person’s at once/ }).check();
  await rules.getByRole('checkbox', { name: 'The right answers' }).check();
  await rules.getByRole('checkbox', { name: 'The explanations' }).check();
  await rules.getByRole('checkbox', { name: /A leaderboard/ }).check();
  await rules.getByLabel('Band 1 name').fill('Recommended');
  await rules.getByLabel('Band 1 from percent').fill('75');
  await rules.getByLabel('Certificates from percent').fill('60');
  await rules.getByRole('button', { name: 'Save' }).click();
  await expect(rules).toBeHidden();
  await expect(faculty.getByText('Recommended 75 %+')).toBeVisible();
  await expect(faculty.getByText('From 60 %')).toBeVisible();
  await faculty.getByRole('button', { name: 'Publish' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(faculty.getByRole('link', { name: /Hand-ins/ })).toBeVisible();

  const student = await signedIn(browser, 'student07@seed.cutm.test');
  await student.getByRole('link', { name: QUIZ }).click();
  await student.getByRole('checkbox', { name: /I have read the rules/ }).check();
  await student.getByRole('button', { name: 'Start quiz' }).click();
  await expect(student).toHaveURL(/\/attempt$/);
  await student.getByText('Inorder', { exact: true }).click();
  await expect(student.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await student.getByRole('button', { name: 'Review answers' }).click();
  await student.getByRole('button', { name: 'Hand in now' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Hand in' }).click();
  await expect(student).toHaveURL(/\/assessments\/[a-f\d]{24}$/);

  // Marked at once, so the result shows now; the place waits for the published results.
  await expect(student.getByText('100%', { exact: true })).toBeVisible();
  await expect(student.getByText('Recommended', { exact: true })).toBeVisible();
  await expect(student.getByText('Your place appears when the results are published.')).toBeVisible();
  await expect(student.getByText('Right answer:')).toBeVisible();
  await expect(student.getByText('Inorder visits left, root, right.')).toBeVisible();

  // TP-12: the certificate, made by the worker while the page waits, with a code anyone can check signed out.
  await student.getByRole('button', { name: 'Certificate', exact: true }).click();
  const certificate = await download(student, 'Certificate');
  expect(certificate.subarray(0, 5).toString()).toBe('%PDF-');
  const code = /\/v\/([A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5})/.exec(certificate.toString('latin1'))?.[1] ?? '';
  expect(code).not.toBe('');
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/v/${code}`);
  await expect(visitor.getByText('Issued by Centurion LMS')).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Student 07' })).toBeVisible();
  await expect(visitor.getByText(QUIZ)).toBeVisible();
  await visitor.goto('/v/AAAAA-AAAAA');
  await expect(visitor.getByRole('heading', { name: 'No certificate has this code' })).toBeVisible();

  // The results page works out the analysis on request.
  await faculty.goto(builder);
  await faculty.getByRole('link', { name: 'Results', exact: true }).click();
  await expect(faculty.getByRole('heading', { name: 'Results and analytics' })).toBeVisible();
  await faculty.getByRole('button', { name: 'Work them out again' }).click();
  await expect(async () => {
    await faculty.reload();
    await expect(faculty.getByText('Took the test')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(faculty.getByText('Score distribution')).toBeVisible();
  await expect(faculty.getByRole('row', { name: /Which traversal/ })).toContainText('100%');
  // Working the ranks out changes no mark, so the certificate made before stays current.
  await student.reload();
  await expect(student.getByRole('link', { name: 'Certificate', exact: true })).toBeVisible();

  // TP-12: every result in Excel.
  await faculty.getByRole('button', { name: 'Export to Excel', exact: true }).click();
  const sheet = await download(faculty, 'Export to Excel');
  expect(sheet.subarray(0, 2).toString()).toBe('PK');
});
