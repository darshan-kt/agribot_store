'use client';

import type { ApiAnalyticsOverview } from '@agri/contracts';
import { cn } from '@agri/ui';

import { ISSUE_TYPE_LABEL } from '@/lib/analytics/overview';

/**
 * What was found, and how much of it is serious.
 *
 * Bars rather than a pie: the question is "which of these is the big one", which is a
 * comparison of lengths against a shared baseline, and the answer has to survive six
 * categories. Each bar is two segments — everything found, and the critical share of it —
 * so the row that matters is visible without reading the numbers, though the numbers are
 * printed on every row anyway. That direct labelling is what lets this chart use severity
 * colours that fall below 3:1 against the card.
 *
 * The name is the plain one ("Late blight", not Phytophthora infestans) with the type
 * beside it in plain words too, because "fungus" and "insect" are the distinction that
 * changes what a farmer does next.
 */
export function IssueBars({
  issues,
  className,
}: {
  issues: ApiAnalyticsOverview['issues'];
  className?: string;
}) {
  if (issues.length === 0) {
    return <p className="text-ink-muted text-sm">Nothing has been flagged in this field.</p>;
  }

  const most = Math.max(...issues.map((entry) => entry.count));

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-col gap-2.5">
        {issues.map((entry) => {
          const critical = entry.critical_count ?? 0;
          const rest = Math.max(entry.count - critical, 0);
          return (
            <li key={entry.issue.code} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">
                  {entry.issue.name}{' '}
                  <span className="text-ink-muted font-normal">
                    ({ISSUE_TYPE_LABEL[entry.issue.issue_type] ?? entry.issue.issue_type})
                  </span>
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {entry.count}
                  {critical > 0 && (
                    <span className="text-critical-ink font-semibold"> · {critical} critical</span>
                  )}
                </span>
              </div>
              {/* A 2px gap between the two segments, so a bar that is almost all critical
                  still reads as two quantities rather than one block. */}
              <div
                className="flex h-2.5 gap-0.5"
                role="img"
                aria-label={`${entry.issue.name}: ${entry.count} found${
                  critical > 0 ? `, ${critical} of them critical` : ''
                }`}
              >
                {critical > 0 && (
                  <span
                    className="bg-critical rounded-full"
                    style={{ width: `${(critical / most) * 100}%` }}
                  />
                )}
                {rest > 0 && (
                  <span
                    className="bg-info rounded-full"
                    style={{ width: `${(rest / most) * 100}%` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Two segments, so a key is required rather than optional. */}
      <ul className="text-ink-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="bg-critical size-2 rounded-full" />
          Critical
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="bg-info size-2 rounded-full" />
          Low and moderate
        </li>
      </ul>
    </div>
  );
}
