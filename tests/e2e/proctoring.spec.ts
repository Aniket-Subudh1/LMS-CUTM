import { expect, test, type Browser, type Page } from '@playwright/test';

// M04b phase C (TP-08). faculty1 (from `npm run db:seed:e2e`) proctors a quiz on CUTM1602; student03 takes it in full
// screen, leaves it once and pastes once; the live monitor shows the warning and sends a message the runner shows;
// the grader reads the log and waives the penalty. Each run makes its own quiz, so runs never collide.
const password = process.env.E2E_PASSWORD ?? '';
const COURSE = 'CUTM1602 · Programming in C · 2026-ODD · A';
const run = String(Date.now()).slice(-6);
const QUIZ = `Proctored quiz ${run}`;
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

test('a teacher proctors a quiz; leaving full screen is a warning the monitor sees; the grader waives its penalty', async ({
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
  await faculty.keyboard.type('Which of these is a valid identifier in C?');
  await question.getByLabel('Marks', { exact: true }).fill('2');
  await question.getByRole('checkbox', { name: /CO1/ }).check();
  await question.getByPlaceholder('Option 1').fill('2nd_value');
  await question.getByPlaceholder('Option 2').fill('_total');
  await question.getByRole('radio', { name: 'Option 2 is correct' }).check();
  await question.getByRole('button', { name: 'Save question' }).click();
  await expect(question).toBeHidden();

  // TP-08: full screen and blocked copy and paste; handed in at the third serious warning; 1 mark off for each.
  await faculty.getByRole('link', { name: 'Turn on' }).click();
  const rules = faculty.getByRole('dialog', { name: 'Proctoring' });
  await rules.getByRole('checkbox', { name: /Proctor this test/ }).check();
  await expect(rules.getByRole('checkbox', { name: /Require full screen/ })).toBeChecked();
  await rules.getByLabel('Marks off per serious warning').fill('1');
  await rules.getByRole('button', { name: 'Save' }).click();
  await expect(rules).toBeHidden();
  await expect(faculty.getByText('Handed in at the 3rd')).toBeVisible();
  await faculty.getByRole('button', { name: 'Publish' }).click();
  await faculty.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(faculty.getByRole('link', { name: /Live monitor/ })).toBeVisible();

  // The lobby says what is watched (09 §11) and checks that this browser can go full screen.
  const student = await signedIn(browser, 'student03@seed.cutm.test');
  await student.getByRole('link', { name: QUIZ }).click();
  await expect(student.getByText('This test is proctored.', { exact: false })).toBeVisible();
  await expect(student.getByText('3 of 3 ready')).toBeVisible({ timeout: 15_000 });
  await student.getByRole('checkbox', { name: /I have read the rules/ }).check();
  await student.getByRole('button', { name: 'Start quiz' }).click();
  await expect(student).toHaveURL(/\/attempt$/);

  // The test waits in full screen; leaving it is serious warning 1 of 3.
  await expect(student.getByRole('heading', { name: 'This test runs in full screen' })).toBeVisible();
  await student.getByRole('button', { name: 'Enter full screen' }).click();
  await expect(student.getByRole('heading', { name: 'This test runs in full screen' })).toBeHidden();
  await student.evaluate(() => document.exitFullscreen());
  await expect(student.getByRole('heading', { name: 'You left full screen' })).toBeVisible();
  await expect(student.getByText('1 of 3', { exact: true })).toBeVisible();
  await student.getByRole('button', { name: 'Return to full screen' }).click();
  await expect(student.getByRole('heading', { name: 'You left full screen' })).toBeHidden();
  await expect(student.getByText('Serious warning 1 of 3 recorded', { exact: false })).toBeVisible();
  await student.getByRole('alert').filter({ hasText: 'Serious warning' }).getByRole('button', { name: 'OK' }).click();
  // A paste is blocked and recorded as a minor warning.
  await student.evaluate(() => document.body.dispatchEvent(new Event('paste', { bubbles: true })));

  // The live monitor shows the warning; a message reaches the runner at its next beat.
  await faculty.goto(builder);
  await faculty.getByRole('link', { name: /Live monitor/ }).click();
  await expect(faculty.getByRole('heading', { name: 'Live monitor' })).toBeVisible();
  const row = faculty.getByRole('row', { name: /Student 03/ });
  await expect(row.getByText('1 · left full screen')).toBeVisible();
  await row.getByRole('button', { name: 'Actions for Student 03' }).click();
  await faculty.getByRole('menuitem', { name: 'Send a message' }).click();
  const message = faculty.getByRole('dialog', { name: 'Message Student 03' });
  await message.getByLabel('Message').fill('Please stay in full screen.');
  await message.getByRole('button', { name: 'Send' }).click();
  await expect(message).toBeHidden();
  await expect(student.getByText('Please stay in full screen.')).toBeVisible({ timeout: 30_000 });
  await student
    .getByRole('alert')
    .filter({ hasText: 'Message from your teacher' })
    .getByRole('button', { name: 'OK' })
    .click();

  await student.getByText('_total', { exact: true }).click();
  await expect(student.getByText('Saved', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await student.getByRole('button', { name: 'Review answers' }).click();
  await student.getByRole('button', { name: 'Hand in now' }).click();
  await student.getByRole('alertdialog').getByRole('button', { name: 'Hand in' }).click();
  await expect(student).toHaveURL(/\/assessments\/[a-f\d]{24}$/);

  // The grader reads what was recorded and waives the penalty: 2 − 1 becomes 2.
  await faculty.goto(builder.replace(/\/edit$/, '/grade'));
  await faculty
    .getByRole('row', { name: /Student 03/ })
    .getByRole('link', { name: 'Open' })
    .click();
  await expect(faculty.getByRole('heading', { name: 'Proctoring' })).toBeVisible();
  await expect(faculty.getByText('1 serious warning')).toBeVisible();
  await faculty.getByText('Everything recorded', { exact: false }).click();
  await expect(faculty.getByText('Left full screen')).toBeVisible();
  await expect(faculty.getByText('Tried to paste')).toBeVisible();
  const total = faculty.locator('b.text-xl');
  await expect(total).toHaveText(/^1\s*\/\s*2$/);
  await faculty.getByRole('button', { name: 'Waive the penalty' }).click();
  await expect(faculty.getByRole('button', { name: 'Put the penalty back' })).toBeVisible();
  await expect(total).toHaveText(/^2\s*\/\s*2$/);
});
