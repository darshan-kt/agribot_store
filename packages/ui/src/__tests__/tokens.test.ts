/**
 * The token pairings, measured.
 *
 * Every colour in this system is a promise that some ink will be legible on it, and a
 * promise like that is checkable — so it is checked here rather than trusted. This file
 * parses tokens.css and computes WCAG contrast for the combinations the components
 * actually use, in both themes.
 *
 * It exists because reasoning about these by eye failed: `SeverityChip` wore the ink
 * meant for the *solid* severity fill on the *soft* fill, which measured 1.4:1 in light
 * and about 1.3:1 for all three chips in dark. Nothing caught it, because nothing was
 * looking. Now something is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from the package root: vitest runs with the package as its working directory,
// and under jsdom `import.meta.url` is not a file URL to resolve against.
const css = readFileSync(join(process.cwd(), 'src/tokens.css'), 'utf8');

/** Every `--name: #rrggbb` in the file. Both themes live here, under different prefixes. */
function tokens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, hex] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    found.set(name!, hex!);
  }
  return found;
}

const VALUES = tokens();

/** Light tokens are `--color-x`; dark ones are `--dark-x` and fall back to light. */
function colour(theme: 'light' | 'dark', name: string): string {
  const value = theme === 'dark' ? VALUES.get(`dark-${name}`) : undefined;
  const resolved = value ?? VALUES.get(`color-${name}`);
  if (!resolved) throw new Error(`No token for ${name} in ${theme}`);
  return resolved;
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = ['light', 'dark'] as const;

/** Text on a fill. 4.5:1 is the AA floor for the sizes this product uses. */
const TEXT_ON_FILL: Array<[ink: string, fill: string, where: string]> = [
  ['ink', 'surface', 'body text on a card'],
  ['ink', 'bg', 'body text on the page'],
  ['ink', 'surface-sunk', 'body text in a well'],
  ['ink-muted', 'surface', 'secondary text on a card'],
  ['ink-subtle', 'surface', 'the faintest ink on a card'],
  ['ink-subtle', 'bg', 'the faintest ink on the page'],
  ['on-primary', 'primary', 'a primary button'],
  ['on-primary', 'primary-hover', 'a primary button under the pointer'],
  // Not `on-info` over `info`: the brief fixes info blue at #3E7CB1, and white on it
  // measures 4.45:1 — AA for large text, a hair under it for small. So the info fill
  // carries marks and large text, and anything text-bearing uses the darker step. That
  // is a constraint of a locked palette, recorded here rather than wished away.
  ['on-info', 'info-hover', 'an info fill carrying text'],
  ['on-critical', 'critical', 'a critical fill'],
  ['on-critical', 'danger', 'a danger button'],
  ['on-critical', 'danger-hover', 'a danger button under the pointer'],
  ['on-low', 'low', 'a low fill'],
  ['on-moderate', 'moderate', 'a moderate fill'],
  // The severity chips, which is where this went wrong.
  ['ink', 'low-soft', 'a low chip'],
  ['ink', 'moderate-soft', 'a moderate chip'],
  ['ink', 'critical-soft', 'a critical chip'],
  ['ink', 'primary-soft', 'a primary-soft panel'],
  ['ink', 'info-soft', 'an info-soft panel'],
  ['info-hover', 'info-soft', 'the Simulated badge'],
  ['moderate-ink', 'surface', 'a "Check" or "Pending" written in amber'],
  ['moderate-ink', 'bg', 'the same word on the page ground'],
  ['critical-ink', 'surface', 'a refusal written in red'],
  ['critical-ink', 'bg', 'the same refusal on the page ground'],
];

describe.each(THEMES)('%s theme', (theme) => {
  it.each(TEXT_ON_FILL)('reads %s on %s — %s', (ink, fill) => {
    expect(contrast(colour(theme, ink), colour(theme, fill))).toBeGreaterThanOrEqual(4.5);
  });

  /** Non-text marks — a status dot, a chart line — need 3:1 to be identifiable. */
  it.each(['critical', 'primary', 'info', 'online', 'offline', 'stale', 'danger'])(
    'shows a %s mark against the card it sits on',
    (mark) => {
      expect(contrast(colour(theme, mark), colour(theme, 'surface'))).toBeGreaterThanOrEqual(3);
    },
  );

  /**
   * The two lightest severity steps are the brief's own hex values and cannot be moved:
   * low measures 1.4:1 against a card and moderate 2.5:1. They are therefore never the
   * only carrier of meaning anywhere in the product — every use pairs the colour with
   * the word, and every chart built on them ships a table of the same numbers. This test
   * pins the exception so it stays deliberate: if a future palette change lifts them
   * over 3:1, delete it.
   */
  it.each(['low', 'moderate'])('leaves the %s step below 3:1, by the brief’s palette', (mark) => {
    const measured = contrast(colour(theme, mark), colour(theme, 'surface'));
    if (theme === 'light') expect(measured).toBeLessThan(3);
    expect(measured).toBeGreaterThan(1.3);
  });

  /**
   * The severity scale must separate in lightness, not only in hue, so it survives
   * greyscale and colour-vision deficiency. Each step is meaningfully darker than the
   * one below it — which is the property that broke in dark mode when all three were
   * lifted together.
   */
  it('keeps the severity steps apart in lightness alone', () => {
    const low = relativeLuminance(colour(theme, 'low'));
    const moderate = relativeLuminance(colour(theme, 'moderate'));
    const critical = relativeLuminance(colour(theme, 'critical'));

    expect(low).toBeGreaterThan(moderate);
    expect(moderate).toBeGreaterThan(critical);
    // Adjacent steps differ by at least a 1.5:1 luminance ratio, so they stay distinct
    // printed in black and white.
    expect((low + 0.05) / (moderate + 0.05)).toBeGreaterThanOrEqual(1.5);
    expect((moderate + 0.05) / (critical + 0.05)).toBeGreaterThanOrEqual(1.5);
  });
});
