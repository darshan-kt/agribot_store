import { expect, test } from '@playwright/test';

/**
 * Crop Chat, in a real browser.
 *
 * The thing worth testing end to end here is not that a message appears — the unit tests
 * hold that. It is that the honesty holds in the shipped page: the "no model" notice is
 * on screen before anything is typed, the answers carry the seeded numbers, and choosing
 * a language the advisor cannot answer in changes what the page promises.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/apps/crop-chat');
});

test('says on its face that no model is connected', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Crop Chat' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Model availability' })).toContainText(
    /no language model is connected/i,
  );
});

test('answers from the field’s own numbers', async ({ page }) => {
  await page.getByLabel(/ask about this field/i).fill('what is wrong in the field');
  await page.getByRole('button', { name: 'Ask' }).click();

  const thread = page.getByRole('list', { name: /conversation/i });
  // The same counts Crop Health renders, because both read one overview.
  await expect(thread).toContainText('37 of 1,800 plants scanned');
  await expect(thread).toContainText('14 critical');
  // And it says which screen owns them.
  await expect(thread).toContainText('Crop Health · this field.');
});

test('refuses a question it cannot source rather than inventing one', async ({ page }) => {
  await page.getByLabel(/ask about this field/i).fill('which fertiliser brand should I buy');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('list', { name: /conversation/i })).toContainText(
    /cannot answer that/i,
  );
});

test('offers every language, and admits it cannot yet reply in one', async ({ page }) => {
  const picker = page.getByLabel('Language');
  await expect(picker.locator('option')).toHaveCount(23);

  await picker.selectOption('ta');
  await expect(page.getByRole('status', { name: 'Model availability' })).toContainText(
    /need a model/i,
  );

  // Urdu is written right to left, so the composer has to follow.
  await picker.selectOption('ur');
  await expect(page.getByLabel(/ask about this field/i)).toHaveAttribute('dir', 'rtl');
});

test('remembers the chosen language across a reload', async ({ page }) => {
  await page.getByLabel('Language').selectOption('hi');
  await page.reload();
  await expect(page.getByLabel('Language')).toHaveValue('hi');
});

test('gets back to the store', async ({ page }) => {
  await page.getByRole('link', { name: 'Store' }).click();
  await expect(page.getByRole('heading', { name: 'Agri Robot Store' })).toBeVisible();
});
