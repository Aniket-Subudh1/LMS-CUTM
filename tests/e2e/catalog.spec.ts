import { expect, test, type Page } from '@playwright/test';

// M01b T13. Fixture users come from `npm run db:seed:e2e` (10 §3); the course list is tests/e2e/fixtures.
const password = process.env.E2E_PASSWORD ?? '';

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test('admin loads a course and its coordinator completes it; other faculty only read it', async ({ page }) => {
  // AC-M01b-01: the course list upload (uploading it again changes nothing).
  await signIn(page, 'admin@seed.cutm.test');
  await page.goto('/admin/imports');
  await page.getByRole('button', { name: 'Upload course list' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload the course list' });
  await upload.locator('input[type=file]').setInputFiles('tests/e2e/fixtures/course-list.csv');
  await upload.getByRole('button', { name: 'Upload' }).click();
  await expect(upload.getByText('Course list imported.')).toBeVisible();
  await expect(upload).toBeHidden();
  await expect(page.getByText(/2 rows ·/).first()).toBeVisible();

  await page.goto('/catalog?q=CUTM2101');
  await page.getByRole('link', { name: /CUTM2101/ }).click();
  await expect(page.getByRole('heading', { name: 'CUTM2101 · Data Structures with C' })).toBeVisible();
  const courseUrl = page.url();
  await expect(page.getByRole('link', { name: 'BTECH-CSE · B.Tech Computer Science and Engineering' })).toBeVisible();

  await page.getByRole('button', { name: 'Coordinator' }).click();
  const coordinator = page.getByRole('dialog', { name: 'Course coordinator' });
  await coordinator.getByLabel('Faculty name or email').fill('Pradeep');
  await coordinator.getByRole('button', { name: 'Find' }).click();
  await coordinator.getByRole('radio', { name: /Pradeep Sahoo/ }).check();
  await coordinator.getByRole('button', { name: 'Save coordinator' }).click();
  await expect(coordinator.getByText('Coordinator saved.')).toBeVisible();
  await expect(page.getByText(/Coordinator: Pradeep Sahoo/)).toBeVisible();

  // CRS-07: the coordinator works through the readiness checklist.
  await signIn(page, 'faculty1@seed.cutm.test');
  await page.goto('/catalog?mine=1&q=CUTM2101');
  await page.getByRole('link', { name: /CUTM2101/ }).click();
  await expect(page.getByRole('heading', { name: 'Course readiness' })).toBeVisible();

  // M03b: one outcome at a time, in a dialog the URL opens; the server gives its code. The statement is new on every
  // run and the outcome is deleted at the end, so repeated runs do not fill the course.
  const statement = `Design linked structures in C (run ${Date.now()}).`;
  await page.goto(`${courseUrl}?new=co`);
  const outcome = page.getByRole('dialog', { name: /^Add CO\d+$/ });
  const code = ((await outcome.getByRole('heading').first().textContent()) ?? '').replace('Add ', '');
  await outcome.getByLabel('Outcome').fill(statement);
  // A Bloom level is a chip (a label around a hidden checkbox); a person clicks the chip.
  await outcome
    .locator('label')
    .filter({ hasText: /^create$/ })
    .click();
  await expect(outcome.getByRole('checkbox', { name: 'create' })).toBeChecked();
  await outcome.getByRole('button', { name: 'Add outcome' }).click();
  await expect(outcome.getByText('Outcome added.')).toBeVisible();
  await expect(page.getByText(statement)).toBeVisible();

  // AC-M01b-05: the grid is edited in place; a key press sets a level and the grid saves in one go.
  await page.getByRole('button', { name: `${code} to PO1: no link` }).press('3');
  await expect(page.getByRole('button', { name: `${code} to PO1: level 3` })).toBeVisible();
  await expect(page.getByText('1 unsaved change')).toBeVisible();
  await page.getByRole('button', { name: 'Save mapping' }).click();
  await expect(page.getByText('Mapping saved.')).toBeVisible();
  await expect(page.getByText('No unsaved changes')).toBeVisible();

  // AC-M01b-04: another faculty member reads the course and cannot edit it.
  await signIn(page, 'faculty2@seed.cutm.test');
  await page.goto(courseUrl);
  await expect(page.getByText(statement)).toBeVisible();
  await expect(page.getByLabel(`${code} to PO1: 3`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save mapping' })).toHaveCount(0);
  await expect(page.getByText('Kept by Pradeep Sahoo, the course coordinator.').first()).toBeVisible();
  await expect(page.getByText('Waiting for the course coordinator').first()).toBeVisible();

  // The coordinator deletes it from its row menu; its code is never given again.
  await signIn(page, 'faculty1@seed.cutm.test');
  await page.goto(courseUrl);
  await page.getByRole('button', { name: `Actions for ${code}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(statement)).toHaveCount(0);
  await expect(page.getByText(`CO${Number(code.slice(2)) + 1} is next`)).toBeVisible();
});
