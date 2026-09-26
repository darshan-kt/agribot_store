import type { ApiStoreApp } from '@agri/contracts';
import { cn } from '@agri/ui';
import Link from 'next/link';

import { AppIcon, type AppIconName } from '../app-icon';

const BADGE_TONE: Record<string, string> = {
  critical: 'bg-critical text-on-critical',
  warning: 'bg-moderate text-on-moderate',
  info: 'bg-info text-on-info',
  neutral: 'bg-surface-sunk text-ink',
};

/**
 * One app in the grid.
 *
 * The whole card is the link — a small "Open" affordance inside a large tappable region
 * gives a gloved hand two targets where it needs one. The badge is a live count from the
 * backend, so it reads as state rather than ornament, and it is placed where the eye
 * lands after the name instead of floating in a corner.
 */
export function AppCard({ app, featured = false }: { app: ApiStoreApp; featured?: boolean }) {
  const badge = app.badge;

  return (
    <Link
      href={app.route as '/'}
      className={cn(
        'border-line bg-surface group relative flex flex-col gap-3 rounded-md border p-4',
        'hover:border-primary focus-visible:outline-focus focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'motion-safe:duration-fast motion-safe:transition-[border-color,transform]',
        'motion-safe:hover:-translate-y-0.5',
        featured && 'sm:flex-row sm:items-start sm:gap-5 sm:p-5',
      )}
    >
      <span
        className={cn(
          'bg-primary-soft text-primary flex shrink-0 items-center justify-center rounded-sm',
          featured ? 'size-14' : 'size-11',
        )}
      >
        <AppIcon name={app.icon as AppIconName} className={featured ? 'size-8' : 'size-6'} />
      </span>

      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'font-display font-semibold leading-tight',
              featured ? 'text-2xl' : 'text-lg',
            )}
          >
            {app.name}
          </span>
          {badge && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
                BADGE_TONE[badge.tone] ?? BADGE_TONE.neutral,
              )}
            >
              {badge.label}
            </span>
          )}
        </span>

        <span className={cn('text-ink-muted text-pretty', featured ? 'text-base' : 'text-sm')}>
          {featured ? app.description : app.tagline}
        </span>

        {featured && (
          <span
            className="text-primary mt-1 inline-flex items-center gap-1 text-sm font-semibold"
            aria-hidden
          >
            Open {app.name}
            <svg viewBox="0 0 12 12" className="size-3">
              <path
                d="M2 6h7m-3-3.5L9.5 6 6 9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </span>
    </Link>
  );
}
