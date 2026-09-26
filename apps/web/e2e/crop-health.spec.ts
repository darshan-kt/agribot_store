import { expect, type Page, test } from '@playwright/test';

/**
 * Crop Health, in a real browser — and at 380 px as well as 1440, because this is one of
 * the three apps the brief puts on a phone.
 *
 * The unit tests hold the grouping and the CSV. What only a browser can show is the
 * export actually producing a file, the clipboard actually taking the coordinates, and
 * the page surviving a phone viewport with its charts and tables intact.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/apps/crop-health');
});

/** Proof React has taken over: the filter is inert until it has. */
async function hydrated(page: Page) {
  const list = page.getByRole('list', { name: /hotspots/i });
  const before = await list.getByRole('listitem').count();
  await page.getByRole('button', { name: /^Critical \d+$/ }).click();
  await expect(list.getByRole('listitem')).not.toHaveCount(before);
  await page.getByRole('button', { name: /^All \d+$/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(before);
}

test('leads with one sentence a farmer can act on', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Crop Health' })).toBeVisible();
  await expect(page.getByText(/late blight is spreading in rows 6 to 9/i)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Urgent' })).toBeVisible();
});

test('the figures under the sentence tell the same story', async ({ page }) => {
  await expect(page.getByText('1,800')).toBeVisible();
  await expect(page.getByText('2.1%').first()).toBeVisible();
  await expect(page.getByText('up 0.5 points on the last run')).toBeVisible();
});

test('publishes the trend as a table as well as a chart', async ({ page }) => {
  await page.getByText('Show the numbers').click();
  const table = page.getByRole('table', { name: /infection rate by scouting run/i });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(8); // seven runs and a header
});

test('filters hotspots by severity', async ({ page }) => {
  await hydrated(page);
  const list = page.getByRole('list', { name: /hotspots/i });

  await page.getByRole('button', { name: /^Low \d+$/ }).click();
  const shown = await list.getByRole('listitem').count();
  expect(shown).toBeGreaterThan(0);
  for (const item of await list.getByRole('listitem').all()) {
    await expect(item).toContainText('Low');
  }
});

test('opens a plant from a hotspot and gives the walk to it', async ({ page }) => {
  await hydrated(page);
  await page
    .getByRole('list', { name: /hotspots/i })
    .getByRole('button')
    .first()
    .click();

  await expect(page.getByText('Flagged plant', { exact: true })).toBeVisible();
  await expect(page.getByText('From the field edge', { exact: true })).toBeVisible();
  await expect(page.getByText('What to do', { exact: true })).toBeVisible();
  await expect(page.getByText(/no photograph was stored/i)).toBeVisible();
});

test('copies the coordinates to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are a Chromium API here.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await hydrated(page);
  await page
    .getByRole('list', { name: /hotspots/i })
    .getByRole('button')
    .first()
    .click();

  const shown = await page
    .locator('dl ~ div')
    .getByText(/^5\d\.\d+, \d\.\d+$/)
    .first()
    .textContent();
  await page.getByRole('button', { name: 'Copy GPS' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(shown?.trim());
});

test('refuses to record an inspection it cannot save', async ({ page }) => {
  await hydrated(page);
  await page
    .getByRole('list', { name: /hotspots/i })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: /mark inspected/i }).click();

  await expect(page.getByRole('alert').filter({ hasText: /was not recorded/i })).toBeVisible();
});

test('exports the findings as a file that actually downloads', async ({ page }) => {
  await hydrated(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export csv/i }).click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^b-4-detections-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString('utf8');

  expect(csv.split('\r\n')[0]).toContain('"severity"');
  // Every simulated row keeps its label in the file, not only on the screen.
  expect(csv).toContain('"sim"');
  expect(csv.trimEnd().split('\r\n').length).toBeGreaterThan(100);
});

test('selecting a plant on the map opens the same plant', async ({ page }) => {
  await hydrated(page);
  const map = page.getByRole('img', { name: /flagged plants/ });
  // The header is sticky, so a pin near the top of the map sits under it. Scrolling the
  // map into view first is what a person does too.
  await map.scrollIntoViewIfNeeded();
  // The last pin painted is the one on top, which is the one a tap would reach.
  await map.locator('circle[role="button"]').last().click();

  await expect(page.getByText('Flagged plant', { exact: true })).toBeVisible();
  await expect(page.locator('svg circle[aria-pressed="true"]')).toHaveCount(1);
});

test('gets back to the store', async ({ page }) => {
  await page.getByRole('link', { name: 'Store' }).click();
  await expect(page).toHaveURL('/');
});
