import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/**
 * A panel.
 *
 * Border, fill, radius and shadow each say "separate object", so they are spent by role
 * rather than stamped on every block: `flat` is the default and carries only a line,
 * `raised` earns a shadow because it sits above the page, and `sunk` is a well for
 * content that belongs *inside* something else. Most panels in this product are flat.
 */
export function Card({
  as: Tag = 'section',
  tone = 'flat',
  className,
  children,
}: {
  as?: 'section' | 'article' | 'div' | 'li';
  tone?: 'flat' | 'raised' | 'sunk';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'rounded-md',
        tone === 'flat' && 'bg-surface border-line border',
        tone === 'raised' && 'bg-surface-raised border-line border shadow-md',
        tone === 'sunk' && 'bg-surface-sunk',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3 px-4 pb-2 pt-3.5', className)}>
      <div className="flex flex-col gap-0.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="font-display text-balance text-lg font-semibold leading-snug">{title}</h2>
      </div>
      {action}
    </header>
  );
}

/** Small capitalised label. Used to name a group of values, never as decoration. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]', className)}
    >
      {children}
    </span>
  );
}

/**
 * A labelled measurement.
 *
 * The number is mono with tabular figures so that a column of them lines up and a
 * changing value does not make the row jitter — a digit that shifts position while you
 * are reading it is the single most common way telemetry becomes unreadable.
 */
export function Metric({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'default' | 'critical' | 'warning';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Eyebrow>{label}</Eyebrow>
      <p className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-mono text-2xl font-semibold tabular-nums leading-none',
            tone === 'critical' && 'text-critical-ink',
            tone === 'warning' && 'text-moderate-ink',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-ink-muted font-mono text-sm">{unit}</span>}
      </p>
      {hint && <p className="text-ink-muted text-sm">{hint}</p>}
    </div>
  );
}
