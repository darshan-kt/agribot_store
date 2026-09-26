'use client';

import type { ApiDetection } from '@agri/contracts';
import { cn, EmptyState, SEVERITY_LABEL } from '@agri/ui';
import { useEffect, useRef } from 'react';

/**
 * Everything the run flagged, newest first.
 *
 * This is the third view of the same set — the map has where, the cameras have what it
 * looked like, and the log has when. Selecting a row selects it everywhere, so a pin
 * someone taps on the map is the row that scrolls into view here, and the other way
 * round. Without that the three panels are three separate screens sharing a page.
 */
export function DetectionLog({
  detections,
  selectedId,
  onSelect,
  className,
}: {
  detections: readonly ApiDetection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // A selection made on the map has to be findable here, and the list is longer than the
  // panel. `nearest` rather than `center` so an already-visible row does not jump.
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector(`[data-detection-id="${selectedId}"]`);
    // Guarded because scrolling is a browser affordance, not part of the behaviour:
    // jsdom has no layout and does not implement it, and the selection is still correct
    // without it.
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedId]);

  if (detections.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          title="Nothing flagged yet"
          body="Plants appear here as the robot finds them. A run that flags nothing is a healthy field, not a failure."
        />
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      // `relative` is load-bearing, not cosmetic: without a positioned ancestor the 37
      // rows resolve their containing block to the document, and Chromium counts the
      // last one's bottom toward document scroll height — 2687 px of scrollable page
      // behind 1264 px of content. Measured before and after.
      className={cn('divide-line relative divide-y overflow-y-auto', className)}
      aria-label="Plants flagged, newest first"
    >
      {detections.map((detection) => {
        const selected = detection.id === selectedId;
        return (
          <li key={detection.id} data-detection-id={detection.id}>
            <button
              type="button"
              onClick={() => onSelect(selected ? null : detection.id)}
              aria-pressed={selected}
              className={cn(
                'focus-visible:outline-focus flex w-full items-center gap-3 px-3 py-2 text-left',
                'motion-safe:duration-fast focus-visible:outline-2 focus-visible:-outline-offset-2 motion-safe:transition-colors',
                selected ? 'bg-primary-soft' : 'hover:bg-surface-sunk',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'h-8 w-1 shrink-0 rounded-full',
                  detection.severity === 'critical' && 'bg-critical',
                  detection.severity === 'moderate' && 'bg-moderate',
                  detection.severity === 'low' && 'bg-low',
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {detection.issue.name}
                  <span className="sr-only">, {SEVERITY_LABEL[detection.severity]}</span>
                </span>
                <span className="text-ink-muted text-xs">
                  {detection.row != null ? `Row ${detection.row}` : 'Row unknown'}
                  {detection.metres_from_edge != null && (
                    <span className="font-mono">
                      {' '}
                      · {detection.metres_from_edge.toFixed(0)} m in
                    </span>
                  )}
                  <span> · {detection.camera} camera</span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <time
                  dateTime={detection.detected_at}
                  className="text-ink-muted font-mono text-xs tabular-nums"
                >
                  {new Date(detection.detected_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <span className="text-ink-subtle text-2xs font-mono tabular-nums">
                  {Math.round(detection.confidence * 100)}%
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
