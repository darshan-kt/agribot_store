import { expect, type Page, test } from '@playwright/test';

/**
 * Mission Planner, in a real browser.
 *
 * The unit tests hold the planner's arithmetic and the interlock chain. What only a
 * browser can show is the part that needs layout: tapping the field to place a waypoint
 * goes through `getScreenCTM`, which jsdom does not implement, so the map's inverse
 * projection is only ever exercised here.
 *
 * As in Crop Scout, the honest states are the happy path. With no command service, a
 * planner that started a mission would be the failure.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/apps/mission-planner');
});

/** Wait until React has taken over: server markup is already correct, so the only proof
 *  handlers are attached is a control that changes something. */
async function hydrated(page: Page) {
  await page.getByRole('button', { name: /follow the edge/i }).click();
  await expect(page.getByRole('img', { name: /route of 5 points/ })).toBeVisible();
  await page.getByRole('button', { name: /snake the rows/i }).click();
  await expect(page.getByRole('img', { name: /route of 18 points/ })).toBeVisible();
}

test('plans a snake over the field’s real rows', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
  await expect(page.getByRole('img', { name: /route of 18 points/ })).toBeVisible();
  // 9 rows of 100 m plus the transits between them.
  await expect(page.getByText('912')).toBeVisible();
});

test('switches between planning and driving', async ({ page }) => {
  await hydrated(page);

  await page.getByRole('button', { name: 'Remote control' }).click();
  await expect(page.getByRole('region', { name: 'Drive the robot' })).toBeVisible();
  await expect(page.getByRole('button', { name: /start the mission/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'Autonomous' }).click();
  await expect(page.getByRole('button', { name: /start the mission/i })).toBeVisible();
});

test('a real keypress drives the robot in remote control mode', async ({ page }) => {
  await hydrated(page);
  await page.getByRole('button', { name: 'Remote control' }).click();

  const bar = page.locator('section[aria-label="Drive the robot"]');
  await expect(bar).toContainText('+0.00 m/s');

  await page.keyboard.down('w');
  await expect(bar).toContainText('+0.56 m/s');
  await page.keyboard.up('w');
  await expect(bar).toContainText('+0.00 m/s');
});

test('tapping the field drops a waypoint where it was tapped', async ({ page }) => {
  await hydrated(page);
  await page.getByRole('button', { name: /draw it yourself/i }).click();
  await expect(page.getByRole('img', { name: /no route planned/ })).toBeVisible();

  const map = page.getByRole('img', { name: /^Field B-4/ });
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  await expect(page.getByRole('img', { name: /route of 1 points/ })).toBeVisible();

  await map.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
  await expect(page.getByRole('img', { name: /route of 2 points/ })).toBeVisible();

  // The coordinates land inside the seeded field, which is the whole point of going
  // through the map's inverse projection rather than guessing at pixels.
  const list = page.getByRole('list', { name: /route points in order/i });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toContainText(/51\.98\d+, 5\.66\d+/);

  // A tap on a placed point takes it away again.
  await page.locator('svg circle[aria-label="Remove point 1"]').click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

test('will not spray, and says which condition it cannot confirm', async ({ page }) => {
  const spray = page.getByRole('button', { name: /hold to spray/i });
  await expect(spray).toBeDisabled();
  await expect(page.getByText(/will not spray/i)).toBeVisible();
  await expect(page.getByText('Not armed')).toBeVisible();
});

test('arming takes a second, deliberate confirmation', async ({ page }) => {
  await hydrated(page);

  await page.getByRole('button', { name: /^arm the sprayer$/i }).click();
  await expect(page.getByText(/opens the pesticide valve/i)).toBeVisible();

  await page.getByRole('button', { name: /yes, arm it/i }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /was not armed and nothing was sent/i }),
  ).toBeVisible();
  // The refusal message also contains the words; the badge is the one that matters.
  await expect(page.getByText('Not armed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /hold to spray/i })).toBeDisabled();
});

test('the nozzle slider changes the band the rig sprays', async ({ page }) => {
  await hydrated(page);

  const rig = page.getByRole('img', { name: /side view of the rig/i });
  await expect(rig).toHaveAttribute('aria-label', /45 centimetres/);

  const slider = page.getByLabel('Nozzle height');
  await slider.fill('90');
  await expect(rig).toHaveAttribute('aria-label', /90 centimetres/);
  // 90 cm through a 60° cone reaches 0.52 m from the nozzle. A 180° arc sprays that
  // radius ahead of the rig; switching to 360° sprays it behind as well, so the band
  // doubles without the nozzle moving.
  await expect(page.getByText(/sprays a band/i)).toContainText('0.52 m');
  await page.getByRole('button', { name: /360/ }).click();
  await expect(page.getByText(/sprays a band/i)).toContainText('1.04 m');
});

test('refuses to start a mission it cannot send', async ({ page }) => {
  await hydrated(page);
  await page.getByRole('button', { name: /start the mission/i }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /nothing was started or sent/i }),
  ).toBeVisible();
});

test('shows the request the backend will have to accept', async ({ page }) => {
  await page.getByText('The request this would send').click();
  await expect(page.getByText(/"pattern": "snake"/)).toBeVisible();
});

test('gets back to the store', async ({ page }) => {
  await page.getByRole('link', { name: 'Store' }).click();
  await expect(page).toHaveURL('/');
});
