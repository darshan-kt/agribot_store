import type { Severity } from '@agri/contracts';

import { cn } from '../lib/cn';

/**
 * Severity is never communicated by colour alone.
 *
 * Every visual treatment in this module pairs the colour with its word, because the
 * three-step scale has to survive greyscale, colour-vision deficiency, and a phone
 * screen washed out by direct sun. The colours also differ in lightness, not just hue,
 * so they stay distinguishable even when the label is clipped.
 */

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  critical: 'Critical',
};

/** Worst first — the order an operator triages in. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'moderate', 'low'] as const;

/**
 * Chips sit on the *soft* fill, so they wear ordinary ink.
 *
 * The `on-*` tokens are the ink for the solid severity fill and are wrong here by a wide
 * margin — white on pale pink measured 1.4:1, and all three dark chips about 1.3:1. Ink
 * on the soft fill clears 4.5:1 in both themes, and the severity still arrives through
 * three channels that do not depend on it: the border, the dot, and the word itself.
 */
const CHIP: Record<Severity, string> = {
  low: 'bg-low-soft text-ink border-low',
  moderate: 'bg-moderate-soft text-ink border-moderate',
  critical: 'bg-critical-soft text-ink border-critical',
};

const DOT: Record<Severity, string> = {
  low: 'bg-low',
  moderate: 'bg-moderate',
  critical: 'bg-critical',
};

export function SeverityChip({
  severity,
  count,
  className,
}: {
  severity: Severity;
  count?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5',
        'whitespace-nowrap text-xs font-medium',
        CHIP[severity],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[severity])} />
      {SEVERITY_LABEL[severity]}
      {count !== undefined && <span className="font-mono font-normal tabular-nums">{count}</span>}
    </span>
  );
}

/**
 * Stacked bar of the severity mix.
 *
 * Each segment is labelled in the accessible name rather than only in a tooltip, so the
 * distribution is available without hovering — which is not a gesture a gloved hand
 * makes on a tablet in a field.
 */
export function SeverityBar({
  counts,
  className,
}: {
  counts: Partial<Record<Severity, number>>;
  className?: string;
}) {
  const segments = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: counts[severity] ?? 0,
  })).filter((s) => s.count > 0);
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <div className={cn('bg-surface-sunk h-2 rounded-full', className)} role="presentation" />
    );
  }

  const description = segments
    .map((s) => `${s.count} ${SEVERITY_LABEL[s.severity].toLowerCase()}`)
    .join(', ');

  return (
    <div
      className={cn('bg-surface-sunk flex h-2 gap-0.5 overflow-hidden rounded-full', className)}
      role="img"
      aria-label={`Severity mix: ${description}`}
    >
      {segments.map((s) => (
        <span
          key={s.severity}
          className={cn(
            DOT[s.severity],
            'rounded-full',
            'motion-safe:duration-slow motion-safe:transition-[width]',
          )}
          style={{ width: `${(s.count / total) * 100}%` }}
        />
      ))}
    </div>
  );
}
