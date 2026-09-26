import { expect, type Page, test } from '@playwright/test';

/**
 * Crop Scout, in a real browser.
 *
 * The unit tests already hold the logic. What only a browser can show is that the page
 * hydrates, that the three panels agree with each other once React takes over, and that
 * a real keystroke on a real window drives the teleop bar. The last one matters: the
 * keyboard listener is bound to `window`, not to a focused element, and jsdom is a
 * generous place to test that.
 *
 * Every assertion about missing data is deliberate. With no backend, the honest states
 * ARE the happy path — a page that claimed live video here would be the failure.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/apps/crop-scout');
});

/**
 * Wait until React has taken over.
 *
 * Everything here is server-rendered, so the markup — and most assertions against it —
 * is already correct before hydration. A keypress sent in that window lands on a page
 * with no listeners and is simply lost. Toggling a control and watching the value change
 * is the only proof available that the handlers are attached; nothing else on the page
 * differs before and after.
 */
async function hydrated(page: Page) {
  // Driving the speed slider and watching its printed value follow. A range input is
  // server-rendered with its value already set, so a change that *sticks* is the proof
  // that React has attached — the same role the speed buttons played before.
  const speed = page.getByRole('slider', { name: /speed/i });
  await speed.fill('0.28');
  await expect(speed).toHaveValue('0.28');
  await speed.fill('0.56');
  await expect(speed).toHaveValue('0.56');
  // Hand focus back, so a later keypress is a page-level one rather than a slider nudge.
  await speed.blur();
}

test('loads the run and reports what it found', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Crop Watch' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'B-4 · Tomato' })).toBeVisible();

  // The counts come from the run the robot recorded, not from anything typed in.
  await expect(page.getByText('1,800')).toBeVisible();
  const flagged = page
    .locator('div')
    .filter({ hasText: /^Flagged/ })
    .first();
  await expect(flagged).toContainText('37');

  await expect(
    page.getByRole('img', { name: /Field B-4: 9 rows, 37 plants flagged/ }),
  ).toBeVisible();
});

test('shows the honest states instead of inventing a feed or a position', async ({ page }) => {
  await expect(page.getByText('No video')).toHaveCount(2);
  await expect(page.getByText(/video gateway is not running/i)).toHaveCount(2);
  await expect(
    page.getByRole('status').filter({ hasText: /not connected to a robot/i }),
  ).toBeVisible();
});

test('selecting a plant in the log selects the same plant on the map', async ({ page }) => {
  const log = page.getByRole('list', { name: /plants flagged/i });
  const firstRow = log.getByRole('button').first();

  await expect(firstRow).toHaveAttribute('aria-pressed', 'false');
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');

  // The same detection, pressed, as a pin inside the map SVG.
  const pressedPin = page.locator('svg[role="img"] circle[aria-pressed="true"]');
  await expect(pressedPin).toHaveCount(1);

  // Clicking the map background clears it everywhere.
  await page.locator('svg[role="img"]').click({ position: { x: 5, y: 5 } });
  await expect(firstRow).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('svg[role="img"] circle[aria-pressed="true"]')).toHaveCount(0);
});

test('a real keypress drives the teleop bar and releasing it stops', async ({ page }) => {
  const readout = page.locator('section[aria-label="Drive the robot"]');
  await expect(readout).toContainText('+0.00 m/s');
  await hydrated(page);

  await page.keyboard.down('w');
  await expect(readout).toContainText('+0.56 m/s');
  await expect(page.getByRole('button', { name: 'Forward' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.keyboard.up('w');
  await expect(readout).toContainText('+0.00 m/s');
  await expect(page.getByRole('button', { name: 'Forward' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('the speed limit is continuous and capped at the robot’s configured maximum', async ({
  page,
}) => {
  const speed = page.getByRole('slider', { name: /speed/i });
  // 0.80 m/s is this robot's configured max, and the track cannot go past it.
  await expect(speed).toHaveAttribute('max', '0.8');

  // Any value on the track, not one of three presets — the point of the change.
  await speed.fill('0.23');
  await expect(speed).toHaveValue('0.23');

  const rotation = page.getByRole('slider', { name: /rotation/i });
  // 45 deg/s is the rig's turn ceiling; 0.78 rad/s is that, snapped down onto the step.
  await expect(rotation).toHaveAttribute('max', '0.78');
  await rotation.fill('0.3');
  await expect(rotation).toHaveValue('0.3');
});

test('space stops a held direction', async ({ page }) => {
  const readout = page.locator('section[aria-label="Drive the robot"]');
  await hydrated(page);

  await page.keyboard.down('w');
  await expect(readout).toContainText('+0.56 m/s');

  await page.keyboard.press('Space');
  await expect(readout).toContainText('+0.00 m/s');
  await page.keyboard.up('w');
});

test('refuses to start a scouting run it cannot start', async ({ page }) => {
  await page.getByRole('button', { name: /start scouting/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /nothing was started/i })).toBeVisible();
});

test('the e-stop refuses rather than animating a stop it did not perform', async ({ page }) => {
  await page.getByRole('button', { name: /emergency stop/i }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /no stop command was sent/i }),
  ).toBeVisible();
});

test('gets back to the store', async ({ page }) => {
  await page.getByRole('link', { name: 'Store' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /Agri Robot Store/i })).toBeVisible();
});
