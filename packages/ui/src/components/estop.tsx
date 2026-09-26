'use client';

import { useState } from 'react';

import { cn } from '../lib/cn';

/**
 * Emergency stop.
 *
 * Present in every control surface, always in the same place, always one tap. The rules
 * this component encodes:
 *
 *  - **One tap to stop.** No confirmation dialog. A confirm step on an e-stop is a
 *    safety defect: the cost of an accidental stop is a shrug, the cost of a delayed
 *    one is a person or a crop.
 *  - **Releasing is not the inverse.** Clearing a latched stop takes a deliberate
 *    second action with its own confirmation, because resuming motion is the dangerous
 *    direction.
 *  - **It never looks disabled.** If the robot is offline the button still presses and
 *    still reports what happened — the robot has already stopped via the 300 ms
 *    deadman, and a greyed-out e-stop teaches operators that the control is unreliable.
 *  - **It does not wait to look pressed.** Feedback is immediate; the acknowledgement
 *    from the robot updates the label when it arrives.
 */
export function EstopButton({
  engaged,
  onEngage,
  onRelease,
  pending,
  robotOnline,
  className,
}: {
  engaged: boolean;
  onEngage: () => void;
  onRelease: () => void;
  pending?: boolean;
  robotOnline: boolean;
  className?: string;
}) {
  const [confirmingRelease, setConfirmingRelease] = useState(false);

  if (engaged) {
    return (
      <div className={cn('flex flex-col items-stretch gap-1.5', className)}>
        <div
          role="status"
          className={cn(
            'border-danger bg-critical-soft text-critical-ink flex items-center gap-2',
            'rounded-sm border-2 px-3 py-2 text-sm font-semibold',
          )}
        >
          <StopGlyph className="size-4 shrink-0" />
          Stopped
        </div>
        {confirmingRelease ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setConfirmingRelease(false);
                onRelease();
              }}
              className={cn(
                'bg-primary text-on-primary h-11 flex-1 rounded-sm px-3 text-sm font-semibold',
                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              Yes, release
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRelease(false)}
              className={cn(
                'border-line-strong text-ink h-11 rounded-sm border px-3 text-sm',
                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRelease(true)}
            className={cn(
              'border-line-strong text-ink h-11 rounded-sm border px-3 text-sm font-medium',
              'hover:bg-surface-sunk focus-visible:outline-focus focus-visible:outline-2',
              'focus-visible:outline-offset-2',
            )}
          >
            Release stop
          </button>
        )}
        <p className="text-ink-muted text-xs">
          Check that it is safe before releasing. The robot will not move on its own.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEngage}
      aria-label="Emergency stop"
      className={cn(
        'bg-danger text-on-critical flex items-center justify-center gap-2',
        'h-13 min-w-[var(--size-touch)] rounded-sm px-5 text-base font-bold uppercase tracking-wide',
        'border-danger-hover border-2',
        'hover:bg-danger-hover active:translate-y-px',
        'focus-visible:outline-danger focus-visible:outline-3 focus-visible:outline-offset-2',
        'motion-safe:duration-instant motion-safe:transition-colors',
        className,
      )}
    >
      <StopGlyph className="size-5 shrink-0" />
      Stop
      {pending && <span className="sr-only">Sending</span>}
      {!robotOnline && <span className="sr-only">Robot is offline</span>}
    </button>
  );
}

function StopGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M8.5 2h7L22 8.5v7L15.5 22h-7L2 15.5v-7L8.5 2Z" opacity="0.25" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}
