/**
 * Records the README demo GIFs by driving the real app in a real browser.
 *
 * Playwright can record video but not the mouse — the pointer is drawn by the OS, not
 * the page — so a recording of a click looks like a screen changing for no reason. The
 * cursor below is a DOM element injected into every page that follows the same mouse
 * events Playwright dispatches, which is why every interaction here goes through the
 * helpers rather than calling `locator.click()` directly: the helpers move the mouse to
 * the target first, so the cursor has something to follow.
 *
 * Usage: pnpm demo:gif [name ...]   (no names = record all scenes)
 * Requires ffmpeg on PATH and a production build (`pnpm build`); the server is started
 * here if nothing already answers on the port.
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.resolve(webRoot, '../../docs/media');
const workDir = path.resolve(webRoot, '.demo-video');

const PORT = Number(process.env.DEMO_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

// 1280×800 records at a readable size and scales down to a GIF that stays legible in a
// GitHub README column without becoming a multi-megabyte page weight.
const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 900;
const FPS = 12;

/* ------------------------------------------------------------------ cursor + timing */

/** A pointer the recording can actually see, plus a pulse on every click. */
const CURSOR_SCRIPT = `
  const style = document.createElement('style');
  style.textContent = \`
    #demo-cursor {
      position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
      pointer-events: none; opacity: 0; transform: translate(-3px, -3px);
      transition: opacity 120ms linear;
    }
    #demo-cursor svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,.45)); }
    .demo-ping {
      position: fixed; z-index: 2147483646; pointer-events: none;
      width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 2px solid rgba(56,189,248,.95); animation: demo-ping 500ms ease-out forwards;
    }
    @keyframes demo-ping {
      from { transform: scale(.3); opacity: 1; }
      to   { transform: scale(1.5); opacity: 0; }
    }
  \`;
  const mount = () => {
    if (document.getElementById('demo-cursor')) return;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'demo-cursor';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22">' +
      '<path d="M5 2 L5 19 L9.2 15.2 L12 21.5 L15 20 L12.2 14 L18 13.6 Z" ' +
      'fill="#fff" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(el);
    addEventListener('mousemove', (e) => {
      el.style.opacity = '1';
      el.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 3) + 'px)';
    }, true);
    addEventListener('mousedown', (e) => {
      const ping = document.createElement('div');
      ping.className = 'demo-ping';
      ping.style.left = e.clientX + 'px';
      ping.style.top = e.clientY + 'px';
      document.body.appendChild(ping);
      setTimeout(() => ping.remove(), 520);
    }, true);
  };
  if (document.body) mount();
  else addEventListener('DOMContentLoaded', mount);
`;

const beat = (page, ms = 700) => page.waitForTimeout(ms);

/** Move the visible cursor onto a target, so the click that follows reads as a click. */
async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('target has no box: ' + locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  return box;
}

async function click(page, locator, { settle = 800 } = {}) {
  await moveTo(page, locator);
  await page.waitForTimeout(220);
  await locator.click();
  await page.waitForTimeout(settle);
}

/** Drag across a target — used for the sliders and for drawing a route on the map. */
async function dragTo(page, locator, fromRatio, toRatio) {
  const box = await moveTo(page, locator);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y, { steps: 10 });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function type(page, locator, text) {
  await click(page, locator, { settle: 200 });
  await locator.pressSequentially(text, { delay: 110 });
  await beat(page, 900);
}

/* ------------------------------------------------------------------------- scenes */

const scenes = [
  {
    name: 'store',
    caption: 'The store: browse the apps, filter by what you are doing, open one.',
    async run(page) {
      await page.goto(`${baseURL}/`);
      await page.getByRole('heading', { name: 'Agri Robot Store' }).waitFor();
      await beat(page, 1200);

      // Category filters, then search: the two ways into the catalogue.
      await click(page, page.getByRole('button', { name: 'Field ops', exact: true }));
      await click(page, page.getByRole('button', { name: 'Insights', exact: true }));
      await click(page, page.getByRole('button', { name: 'All', exact: true }));

      await type(page, page.getByRole('searchbox', { name: 'Search apps' }), 'crop');
      await beat(page, 900);

      // Straight into the app the store is built around.
      await click(page, page.getByRole('link', { name: /Crop Watch/ }), { settle: 300 });
      await page.waitForURL('**/apps/crop-scout');
      await page.getByRole('heading', { name: 'Crop Watch' }).waitFor();
      await beat(page, 1600);
    },
  },
  {
    name: 'crop-scout',
    caption: 'Crop Scout: drive the robot, watch both cameras, read what it flagged.',
    async run(page) {
      await page.goto(`${baseURL}/apps/crop-scout`);
      await page.getByRole('heading', { name: 'Crop Watch' }).waitFor();
      await beat(page, 1200);

      // Teleop by keyboard — the listener is on the window, which is the point.
      const speed = page.getByRole('slider').first();
      await dragTo(page, speed, 0.2, 0.62);

      await click(page, page.getByRole('button', { name: 'Forward', exact: true }), {
        settle: 900,
      });
      await click(page, page.getByRole('button', { name: 'Turn right', exact: true }), {
        settle: 900,
      });
      await click(page, page.getByRole('button', { name: 'Stop', exact: true }), { settle: 900 });

      // A flagged plant in the log, and the same plant on the map.
      const log = page.getByRole('list', { name: /Plants flagged/i });
      const entry = log.getByRole('button').nth(1);
      await click(page, entry, { settle: 1400 });
      await beat(page, 1200);
    },
  },
  {
    name: 'mission-planner',
    caption: 'Mission Planner: pick a coverage pattern, arm the sprayer, start the run.',
    async run(page) {
      await page.goto(`${baseURL}/apps/mission-planner`);
      await page.getByRole('heading', { name: 'Mission Planner' }).waitFor();
      await beat(page, 1200);

      await click(page, page.getByRole('button', { name: /follow the edge/i }), { settle: 1100 });
      await click(page, page.getByRole('button', { name: /snake the rows/i }), { settle: 1100 });

      // Mode is an interlock, not a preference: autonomous is the only mode that can
      // start a mission, and the button appearing is the proof.
      await click(page, page.getByRole('button', { name: 'Remote control', exact: true }), {
        settle: 900,
      });
      await click(page, page.getByRole('button', { name: 'Autonomous', exact: true }), {
        settle: 900,
      });

      await click(page, page.getByRole('button', { name: /arm the sprayer/i }), { settle: 1000 });
      await beat(page, 1400);
    },
  },
  {
    name: 'crop-health',
    caption: 'Crop Health: filter by severity, open a hotspot, see it on the field map.',
    async run(page) {
      await page.goto(`${baseURL}/apps/crop-health`);
      await page.getByRole('heading', { name: 'Crop Health' }).waitFor();
      await beat(page, 1200);

      await click(page, page.getByRole('button', { name: /^Critical/ }).first(), { settle: 1100 });

      const hotspots = page.getByRole('button', { name: /plants? · Rows?/ });
      await click(page, hotspots.first(), { settle: 1500 });
      await click(page, hotspots.nth(1), { settle: 1500 });

      await click(page, page.getByRole('button', { name: /^Moderate/ }).first(), { settle: 1200 });
      await beat(page, 1200);
    },
  },
  {
    name: 'crop-chat',
    caption: 'Crop Chat: ask about the field in your own language.',
    async run(page) {
      await page.goto(`${baseURL}/apps/crop-chat`);
      await page.getByRole('heading', { name: 'Crop Chat' }).waitFor();
      await beat(page, 1200);

      await click(page, page.getByRole('button', { name: /what is wrong in the field/i }), {
        settle: 1600,
      });
      await beat(page, 1200);

      await type(page, page.getByRole('textbox'), 'Where are the worst plants?');
      await click(page, page.getByRole('button', { name: 'Ask', exact: true }), { settle: 1800 });

      // The same field, answered in another language — the reason the picker exists.
      await page.getByRole('combobox').selectOption({ index: 2 });
      await beat(page, 1800);
    },
  },
];

/* -------------------------------------------------------------------------- driver */

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function serverUp() {
  try {
    const res = await fetch(baseURL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  const child = spawn('pnpm', ['exec', 'next', 'start', '--port', String(PORT)], {
    cwd: webRoot,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 60; i += 1) {
    if (await serverUp()) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error(`no server on ${baseURL} — run \`pnpm build\` first`);
}

/** webm → GIF, two-pass so the palette is chosen from the frames rather than guessed. */
async function toGif(video, gif) {
  const filters =
    `fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=192:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-filter_complex', filters, gif]);
}

async function record(scene, browser) {
  const dir = path.join(workDir, scene.name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();

  try {
    await scene.run(page);
  } finally {
    await page.close();
    await context.close();
  }

  const [video] = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
  if (!video) throw new Error(`no video recorded for ${scene.name}`);

  const gif = path.join(outDir, `${scene.name}.gif`);
  await toGif(path.join(dir, video), gif);
  const { size } = await stat(gif);
  console.log(`  ${path.relative(process.cwd(), gif)}  ${(size / 1e6).toFixed(1)} MB`);
}

const wanted = process.argv.slice(2);
const selected = wanted.length ? scenes.filter((s) => wanted.includes(s.name)) : scenes;
if (!selected.length) {
  console.error(`unknown scene. available: ${scenes.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const started = (await serverUp()) ? null : await startServer();
const browser = await chromium.launch();

try {
  for (const scene of selected) {
    console.log(`recording ${scene.name} …`);
    await record(scene, browser);
  }
} finally {
  await browser.close();
  started?.kill();
  await rm(workDir, { recursive: true, force: true });
}
