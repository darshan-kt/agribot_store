'use client';

import type { ApiHotspot, ApiSeverity } from '@agri/contracts';
import { cn, SEVERITY_ORDER, SeverityChip } from '@agri/ui';

import { rowRangeLabel } from '@/lib/analytics/hotspots';
import { ISSUE_TYPE_LABEL } from '@/lib/analytics/overview';

/**
 * The patches, worst first.
 *
 * A farmer does not walk to 37 plants; they walk to the patches those plants form. Each
 * row says what it is, how many plants, and which rows to walk down — everything needed
 * to decide whether to go now, without opening it.
 *
 * The filter is a set of buttons rather than a dropdown: three options, all of which
 * should be one tap away with a gloved hand, and the counts sit on the buttons so
 * filtering to an empty set is visible before it happens.
 */
export function HotspotList({
  hotspots,
  severity,
  onSeverityChange,
  selectedId,
  onSelect,
  className,
}: {
  hotspots: readonly ApiHotspot[];
  severity: ApiSeverity | null;
  onSeverityChange: (severity: ApiSeverity | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const shown = severity ? hotspots.filter((hotspot) => hotspot.severity === severity) : hotspots;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="border-line flex flex-wrap gap-2 border-b px-4 pb-3">
        <FilterButton active={severity === null} onClick={() => onSeverityChange(null)}>
          All {hotspots.length}
        </FilterButton>
        {SEVERITY_ORDER.map((option) => {
          const count = hotspots.filter((hotspot) => hotspot.severity === option).length;
          return (
            <FilterButton
              key={option}
              active={severity === option}
              onClick={() => onSeverityChange(severity === option ? null : option)}
            >
              {option === 'low' ? 'Low' : option === 'moderate' ? 'Moderate' : 'Critical'} {count}
            </FilterButton>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="text-ink-muted px-4 py-6 text-sm">
          No hotspots at this severity. Try another filter.
        </p>
      ) : (
        <ul
          className="divide-line min-h-0 flex-1 divide-y overflow-y-auto"
          aria-label={`${shown.length} hotspots`}
        >
          {shown.map((hotspot) => {
            const selected = hotspot.id === selectedId;
            const rows = rowRangeLabel(hotspot.rows ?? []);
            return (
              <li key={hotspot.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(hotspot.id)}
                  className={cn(
                    'focus-visible:outline-focus flex w-full flex-col gap-1.5 px-4 py-3 text-left',
                    'motion-safe:duration-fast focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-colors',
                    selected ? 'bg-primary-soft' : 'hover:bg-surface-sunk',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={hotspot.severity} />
                    <span className="font-medium">{hotspot.issue.name}</span>
                    <span className="text-ink-muted text-sm">
                      ({ISSUE_TYPE_LABEL[hotspot.issue.issue_type] ?? hotspot.issue.issue_type})
                    </span>
                  </div>
                  <p className="text-ink-muted text-sm">
                    <span className="text-ink font-mono font-semibold tabular-nums">
                      {hotspot.detection_count}
                    </span>{' '}
                    {hotspot.detection_count === 1 ? 'plant' : 'plants'}
                    {rows && ` · ${rows}`}
                    {` · act within ${hotspot.issue.action_within_days} ${
                      hotspot.issue.action_within_days === 1 ? 'day' : 'days'
                    }`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'focus-visible:outline-focus rounded-sm border px-3 py-2 text-sm font-medium',
        'motion-safe:duration-fast focus-visible:outline-2 motion-safe:transition-colors',
        active
          ? 'bg-primary border-primary text-on-primary'
          : 'bg-surface border-line-strong text-ink hover:bg-primary-soft',
      )}
    >
      {children}
    </button>
  );
}
