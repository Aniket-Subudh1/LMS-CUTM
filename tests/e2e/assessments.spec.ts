import { expect, test, type Browser, type Page } from '@playwright/test';

// M04 T10. Fixture users come from `npm run db:seed:e2e` and share E2E_PASSWORD (10 §3). CUTM1602 is a credit course
// with CO1–CO3, taught by faculty1 to student01–student20. Each run makes its own quiz, so runs never collide.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);
const QUIZ = `Quiz ${run}`;
// The IST wall time `minutes` from now, as <input type="datetime-local"> takes it.
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
  await expect(page.getByRole('heading', { name: 'Programming in C', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Assessments' }).click();
  await expect(page.getByRole('heading', { name: 'Assessments', exact: true })).toBeVisible();
  return page;
}

async function addQuestion(page: Page, type: string, fill: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) {
  await page.getByRole('link', { name: type, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`· ${type}$`) });
  await expect(dialog).toBeVisible();
  await fill(dialog);
  await dialog.getByRole('button', { name: 'Save question' }).click();
  await expect(dialog).toBeHidden();
}

async function write(page: Page, editor: ReturnType<Page['locator']>, text: string) {
  await editor.click();
  await page.keyboard.type(text);
}

test('a teacher builds and publishes a quiz; a student takes it; the teacher grades it and publishes the results', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const faculty = await signedIn(browser, 'faculty1@seed.cutm.test');

  // T4: the New assessment dialog asks for the type, title and window only (M04 decision 2).
  await faculty.getByRole('link', { name: 'New assessment' }).click();
  const create = faculty.getByRole('dialog', { name: 'New assessment' });
  await expect(create.getByRole('radio', { name: /Quiz/ })).toBeChecked();
  await create.getByLabel('Title').fill(QUIZ);
  await create.getByLabel('Opens').fill(ist(-5));
  await create.getByLabel('Closes').fill(ist(60));
  await create.getByRole('button', { name: 'Create and add questions' }).click();
  await expect(faculty).toHaveURL(/\/assessments\/[a-f\d]{24}\/edit$/);
  await expect(faculty.getByRole('heading', { name: QUIZ })).toBeVisible();

  await addQuestion(faculty, 'One answer', async (dialog) => {
    await write(faculty, dialog.locator('.ProseMirror').first(), 'Which of these is a valid identifier in C?');
    await dialog.getByLabel('Marks', { exact: true }).fill('2');
    await dialog.getByRole('checkbox', { name: /CO1/ }).check();
    await dialog.getByPlaceholder('Option 1').fill('2nd_value');
    await dialog.getByPlaceholder('Option 2').fill('_total');
    await dialog.getByRole('radio', { name: 'Option 2 is correct' }).check();
  });
  await addQuestion(faculty, 'Number', async (dialog) => {
    await write(faculty, dialog.locator('.ProseMirror').first(), 'How many bytes is an int on a 32-bit compiler?');
    await dialog.getByLabel('Marks', { exact: true }).fill('3');
    await dialog.getByRole('checkbox', { name: /CO1/ }).check();
    await dialog.getByLabel('Correct answer').fill('4');
  });
  // A rubric must add up to the question's marks (AC-M04-05).
  await addQuestion(faculty, 'Written answer', async (dialog) => {
    await write(faculty, dialog.locator('.ProseMirror').first(), 'Write a loop that adds an array.');
    await dialog.getByLabel('Marks', { exact: true }).fill('5');
    await dialog.getByRole('checkbox', { name: /CO2/ }).check();
    await dialog.getByLabel('Criterion 1', { exact: true }).fill('Correct loop');
    await dialog.getByLabel('Marks for criterion 1', { exact: true }).fill('3');
    await dialog.getByLabel('Criterion 2', { exact: true }).fill('Readable');
    await dialog.getByLabel('Marks for criterion 2', { exact: true }).fill('2');
  });
  // Exact: the Assessments list stays mounted, hidden, behind the builder (Next keeps the page it came from).
  await expect(faculty.getByText('3 questions · 10 marks', { exact: true })).toBeVisible();
  await expect(faculty.getByText('Every question has a course outcome')).toBeVisible();

  await faculty.getByRole('button', { name: 'Publish' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(faculty.getByRole('link', { name: /Hand-ins/ })).toBeVisible();

  // T5: the student starts; autosave survives a reload; the attempt is handed in.
  const student = await signedIn(browser, 'student01@seed.cutm.test');
  await student.getByRole('link', { name: QUIZ }).click();
  // M04b "Lobby B": the device check, then the rules to accept before Start.
  await expect(student.getByRole('heading', { name: 'Device check' })).toBeVisible();
  await student.getByRole('checkbox', { name: /I have read the rules/ }).check();
  await student.getByRole('button', { name: 'Start quiz' }).click();
  await expect(student).toHaveURL(/\/attempt$/);
  // "Runner A" (M04b): one question at a time, in this attempt's shuffled order; each is answered as it comes.
  const answers: Record<string, () => Promise<void>> = {
    'valid identifier': () => student.getByText('_total', { exact: true }).click(),
    'bytes is an int': () => student.getByRole('textbox', { name: /bytes is an int/ }).fill('4'),
    'adds an array': () => write(student, student.locator('.ProseMirror'), 'for (int i = 0; i < n; i++) s += a[i];'),
  };
  for (let n = 0; n < 3; n++) {
    const prompt = (await student.locator('article [id$="-title"]').first().innerText()).toLowerCase();
    const key = Object.keys(answers).find((k) => prompt.includes(k));
    if (!key) throw new Error(`unexpected question: ${prompt}`);
    await answers[key]();
    await student.getByRole('button', { name: /^(Save and next|Review answers)$/ }).click();
  }
  await expect(student.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(student.getByRole('heading', { name: 'Review before you hand in' })).toBeVisible();
  await student.reload();
  // After a reload every answer is still there: three answered on the map.
  await expect(student.getByRole('button', { name: /^Question \d, answered/ })).toHaveCount(3);
  await student.getByRole('button', { name: 'Submit' }).click();
  await student.getByRole('button', { name: 'Hand in now' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Hand in' }).click();
  await expect(student).toHaveURL(/\/assessments\/[a-f\d]{24}$/);
  await expect(student.getByText('Your answers are handed in.', { exact: false })).toBeVisible();

  // T6: the teacher marks the written answer by its rubric.
  await faculty.getByRole('link', { name: /Hand-ins/ }).click();
  await faculty.getByRole('link', { name: 'Grade' }).first().click();
  await expect(faculty.getByRole('heading', { name: /Student 01/ })).toBeVisible();
  const essay = faculty.locator('article', { hasText: 'Write a loop that adds an array.' });
  await essay.getByLabel('Correct loop, out of 3').fill('3');
  await essay.getByLabel('Readable, out of 2').fill('1');
  await essay.getByLabel('Comment for the student').fill('Name the loop counter.');
  await faculty.getByRole('button', { name: 'Save marks' }).click();
  await expect(faculty.getByText('Marks saved.')).toBeVisible();
  await expect(faculty.getByText(/^9\s*\/\s*10$/)).toBeVisible();

  // AC-M04-06: results go out once the window has closed; the teacher closes it now by moving the dates.
  await faculty.goto(faculty.url().replace(/\/grade\/[a-f\d]{24}$/, '/edit?new=settings'));
  const settings = faculty.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Opens').fill(ist(-30));
  await settings.getByLabel('Closes', { exact: true }).fill(ist(-1));
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings).toBeHidden();
  await faculty.getByRole('link', { name: /Hand-ins/ }).click();
  await faculty.getByRole('button', { name: 'Publish results' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish results' }).click();
  await expect(faculty.getByText('Results published')).toBeVisible();

  // The student reads marks, the rubric's criteria and the comment, and no answer key.
  await student.reload();
  await expect(student.getByRole('heading', { name: 'Your answers' })).toBeVisible();
  await expect(student.getByText('Name the loop counter.')).toBeVisible();
  await expect(student.getByText('Correct loop')).toBeVisible();
  await expect(student.getByText(/^9\s*\/\s*10 marks$/)).toBeVisible();
  // M04b (TP-11): by default the results show no right answer.
  await expect(student.getByText('Right answer:')).toHaveCount(0);
});
