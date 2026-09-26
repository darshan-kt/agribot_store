import type { Source } from '@agri/contracts';

import { cn } from '../lib/cn';

/**
 * The "Simulated" badge.
 *
 * This is a safety control, not decoration. Someone looking at this screen may be about
 * to drive a machine or spray a pesticide based on what it says, and they must never be
 * unable to tell whether a number came from a real sensor.
 *
 * Two rules hold the guarantee, and both are enforced by the type signature:
 *
 * 1. `source` comes from the backend payload, which passes it through from the
 *    publisher untouched. There is no prop, flag, setting or environment variable that
 *    suppresses the badge — to hide it you would have to lie about `source`, which the
 *    JSON Schema rejects at the boundary.
 * 2. `source` is required, not optional with a default. A caller that has not decided
 *    where its data came from will not compile, so a new surface cannot quietly render
 *    unlabelled values.
 */
export function SimulatedBadge({
  source,
  className,
  size = 'sm',
}: {
  source: Source;
  className?: string;
  /** 'xs' for inline use inside a dense row of values. */
  size?: 'xs' | 'sm';
}) {
  if (source !== 'sim') return null;

  return (
    <span
      className={cn(
        // The darker info step, not the fill colour: this badge is 11px, and #3E7CB1 on
        // the soft blue measures 3.46:1 — Lighthouse caught it on the shipped page. The
        // deeper step clears 4.5:1 in both themes and reads as the same blue.
        'border-info text-info-hover bg-info-soft inline-flex items-center gap-1',
        // Sentence case, per the product's copy rules — and it avoids a kerning bug:
        // Instrument Sans opens a visible gap in the uppercase 'TE' pair, rendering
        // this label as "SIMULAT ED".
        'whitespace-nowrap rounded-sm border font-semibold',
        size === 'xs' ? 'text-2xs px-1 py-0' : 'px-1.5 py-0.5 text-xs',
        className,
      )}
      title="This value came from the simulated robot, not from hardware."
    >
      <svg viewBox="0 0 8 8" aria-hidden className="size-2 fill-current">
        <circle cx="4" cy="4" r="3" />
      </svg>
      Simulated
    </span>
  );
}

/** True when anything in a mixed set of values is simulated. */
export function anySimulated(sources: readonly Source[]): boolean {
  return sources.some((s) => s === 'sim');
}
