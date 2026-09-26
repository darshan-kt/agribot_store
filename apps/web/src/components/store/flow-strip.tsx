import type { ApiStoreApp } from '@agri/contracts';
import Link from 'next/link';

/**
 * Plan → Scout → Analyse → Spray.
 *
 * The arrows encode something true: this is the order the work actually happens in, and
 * each step feeds the next — a mission produces a scouting run, which produces
 * detections, which is what there is to spray. Steps that map to an app link to it; the
 * final step is an action inside Mission Planner rather than an app of its own, so it is
 * shown as part of the sequence but is not a link pretending to be a destination.
 */
const STEPS = [
  { label: 'Plan', slug: 'mission-planner' },
  { label: 'Scout', slug: 'crop-scout' },
  { label: 'Analyse', slug: 'crop-health' },
  { label: 'Spray', slug: null },
] as const;

export function FlowStrip({ apps }: { apps: ApiStoreApp[] }) {
  const routeFor = (slug: string | null) =>
    slug ? apps.find((a) => a.slug === slug)?.route : undefined;

  return (
    <nav aria-label="How the work flows" className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((step, index) => {
        const route = routeFor(step.slug);
        return (
          <span key={step.label} className="flex items-center gap-1.5">
            {route ? (
              <Link
                href={route as '/'}
                className="border-line bg-surface hover:border-primary hover:text-primary focus-visible:outline-focus motion-safe:duration-fast rounded-full border px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors"
              >
                {step.label}
              </Link>
            ) : (
              <span className="border-line text-ink-muted rounded-full border border-dashed px-3 py-1 text-sm">
                {step.label}
              </span>
            )}
            {index < STEPS.length - 1 && (
              <svg viewBox="0 0 12 12" className="text-ink-subtle size-3" aria-hidden>
                <path
                  d="M3 1.5 7.5 6 3 10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        );
      })}
    </nav>
  );
}
