'use client';

import { cn } from '../lib/cn';

export type ConnectionState = 'online' | 'offline' | 'stale' | 'connecting';

const TONE: Record<ConnectionState, string> = {
  online: 'bg-online',
  offline: 'bg-offline',
  stale: 'bg-stale',
  connecting: 'bg-info',
};

const LABEL: Record<ConnectionState, string> = {
  online: 'Online',
  offline: 'Offline',
  stale: 'Not responding',
  connecting: 'Connecting',
};

/**
 * Liveness indicator.
 *
 * The pulse is the one piece of ambient motion in the system, and it means something:
 * it runs only while the connection is actually live, so a frozen dot is itself the
 * signal that data has stopped. It is paired with a text label rather than standing
 * alone, and under prefers-reduced-motion the ring simply does not animate.
 */
export function StatusDot({
  state,
  className,
  label,
}: {
  state: ConnectionState;
  className?: string;
  /** Render the word next to the dot. Default true — colour alone is not a status. */
  label?: boolean;
}) {
  const showLabel = label ?? true;
  const animate = state === 'online' || state === 'connecting';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-flex size-2.5 shrink-0">
        {animate && (
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 rounded-full opacity-60',
              TONE[state],
              'motion-safe:animate-ping-slow',
            )}
          />
        )}
        <span className={cn('relative size-2.5 rounded-full', TONE[state])} />
      </span>
      {showLabel ? (
        <span className="text-sm">{LABEL[state]}</span>
      ) : (
        <span className="sr-only">{LABEL[state]}</span>
      )}
    </span>
  );
}
