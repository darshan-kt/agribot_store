import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Button } from './button';

/**
 * The states every surface needs.
 *
 * A screen that only handles the happy path is unfinished. These cover loading, empty,
 * offline, stale and error — and each error state names a next action rather than
 * apologising, because an operator standing in a field needs to know what to do, not
 * that something is sorry.
 */

/** Shimmerless skeleton: a moving gradient is hard to read in bright sun and adds nothing. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('bg-surface-sunk motion-safe:animate-pulse-soft rounded-sm', className)}
      aria-hidden
    />
  );
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-subtle mb-1">{icon}</div>}
      <h3 className="font-display text-balance text-lg font-semibold">{title}</h3>
      <p className="text-ink-muted max-w-[46ch] text-sm">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 px-4 py-5">
      <h3 className="text-critical-ink font-display text-lg font-semibold">{title}</h3>
      <p className="text-ink-muted max-w-[52ch] text-sm">{body}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Data age.
 *
 * Shown wherever a live value is, and computed from the *server's* receive time rather
 * than the robot's clock, so a robot with skewed time cannot make stale data look fresh.
 * Past the threshold the surrounding values are dimmed by the caller: a number that has
 * stopped updating must not look like one that is still arriving.
 */
export function StaleNotice({
  seconds,
  className,
  threshold = 5,
}: {
  seconds: number;
  className?: string;
  threshold?: number;
}) {
  if (seconds < threshold) return null;
  return (
    <span className={cn('text-stale whitespace-nowrap text-xs font-medium', className)}>
      Last seen {formatAge(seconds)} ago
    </span>
  );
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
}
