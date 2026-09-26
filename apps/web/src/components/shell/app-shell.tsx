import type { ApiRobotDetail } from '@agri/contracts';
import { formatAge, SimulatedBadge, StatusDot } from '@agri/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { livenessOf } from '@/lib/liveness';

import { EstopControl } from './estop-control';

/**
 * The frame every app sits in.
 *
 * Three things are constant across all four apps so an operator never has to look for
 * them: the way back to the store, the robot's liveness, and the emergency stop. The
 * e-stop keeps the same position in every app for the same reason a physical one is
 * always red and always in the same place on the machine.
 */
export function AppShell({
  robot,
  title,
  subtitle,
  showEstop = false,
  children,
}: {
  robot: ApiRobotDetail;
  title: string;
  subtitle?: string;
  /** Apps that can command the robot carry the stop. */
  showEstop?: boolean;
  children: ReactNode;
}) {
  const liveness = livenessOf(robot);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line bg-surface sticky top-0 z-20 border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link
            href="/"
            className="text-ink-muted hover:text-primary focus-visible:outline-focus motion-safe:duration-fast inline-flex items-center gap-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors"
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path
                d="M7 2 3.5 6 7 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Store
          </Link>

          <span aria-hidden className="bg-line h-4 w-px" />

          <div className="flex min-w-0 flex-col">
            <h1 className="font-display truncate text-lg font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="text-ink-subtle truncate text-xs">{subtitle}</p>}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <StatusDot state={liveness.state} label={false} />
              <span className="text-sm font-medium">{robot.name}</span>
              <SimulatedBadge source={robot.source} size="xs" />
              {liveness.stale && liveness.ageSeconds !== null && (
                <span className="text-stale whitespace-nowrap text-xs">
                  last seen {formatAge(liveness.ageSeconds)} ago
                </span>
              )}
            </div>
            {showEstop && <EstopControl robotOnline={liveness.state === 'online'} />}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
