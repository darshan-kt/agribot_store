'use client';

import type { ApiDetection, ApiFieldDetail, ApiSeverity } from '@agri/contracts';
import { cn, SEVERITY_LABEL } from '@agri/ui';

import { FieldCanvas, MapLegend, type MapLegendItem } from '@/components/map/field-canvas';
import type { LatLon } from '@/lib/geo';

/**
 * Every flagged plant in the field, on one map.
 *
 * Crop Scout's map shows one run as it happens; this one shows everything still
 * outstanding, which is the view you want before deciding where to walk. Same canvas,
 * same projection, same rotation — a plant is in the same place in both apps, which is
 * the entire reason the canvas was pulled out into `components/map`.
 *
 * Inspected plants keep their severity colour but lose their fill, so a field that has
 * been worked through reads as outlines with a few solid dots left in it. That is the
 * progress an operator is actually tracking, and it survives greyscale.
 *
 * Two things follow from putting 161 plants on a field 16 m wide.
 *
 * **The worst plant is painted last**, so where pins overlap the one on top — and the one
 * a tap lands on — is the one that matters. Painted in arrival order, a critical plant can
 * end up underneath a low one, and the tap goes to the wrong plant.
 *
 * **The hit area is bigger than the dot.** A pin drawn large enough to tap with a glove
 * at this density would be a field of overlapping circles, so the mark stays small and an
 * invisible target sits over it. A dot that cannot be hit is not tappable, whatever it
 * looks like.
 */

const PIN: Record<ApiSeverity, string> = {
  low: 'fill-low',
  moderate: 'fill-moderate',
  critical: 'fill-critical',
};

/** Painted in this order, so critical lands on top of moderate lands on top of low. */
const PAINT_ORDER: Record<ApiSeverity, number> = { low: 0, moderate: 1, critical: 2 };

/** The invisible target over each dot, in metres. Roughly a 44 px touch area once the
 *  100 m field is drawn across a phone. */
const HIT_RADIUS_M = 2.8;

const STROKE: Record<ApiSeverity, string> = {
  low: 'stroke-low',
  moderate: 'stroke-moderate',
  critical: 'stroke-critical',
};

export function HealthMap({
  field,
  detections,
  selectedId,
  onSelect,
  className,
}: {
  field: ApiFieldDetail;
  detections: readonly ApiDetection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const pinned = detections.filter(
    (d): d is ApiDetection & { location: LatLon } => d.location != null,
  );
  const inspected = pinned.filter((d) => d.inspection_status != null).length;

  // Painting order, worst last. The array order is otherwise "newest first", which is a
  // recency ranking and has nothing to do with which plant should be on top.
  const painted = [...pinned].sort((a, b) => PAINT_ORDER[a.severity] - PAINT_ORDER[b.severity]);

  const legend: MapLegendItem[] = (['critical', 'moderate', 'low'] as const)
    .filter((severity) => pinned.some((d) => d.severity === severity))
    .map((severity) => ({
      mark: 'dot' as const,
      className: PIN[severity],
      label: SEVERITY_LABEL[severity],
    }));
  if (inspected > 0) {
    legend.push({ mark: 'ring', className: 'stroke-ink-subtle', label: 'Already inspected' });
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <FieldCanvas
        field={field}
        points={pinned.map((d) => d.location)}
        label={`Field ${field.name}: ${pinned.length} flagged plants, ${inspected} already inspected`}
        onBackgroundClick={() => onSelect(null)}
      >
        {(projection) =>
          painted.map((detection) => {
            const selected = detection.id === selectedId;
            const done = detection.inspection_status != null;
            const x = projection.toX(detection.location);
            const y = projection.toY(detection.location);
            return (
              <g key={detection.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={selected ? 2.4 : 1.4}
                  className={cn(
                    done ? cn('fill-none', STROKE[detection.severity]) : PIN[detection.severity],
                    !done && 'stroke-surface',
                    'pointer-events-none',
                    'motion-safe:duration-fast motion-safe:transition-[r]',
                  )}
                  strokeWidth={selected ? 0.7 : 0.4}
                  aria-hidden
                />
                <circle
                  cx={x}
                  cy={y}
                  r={HIT_RADIUS_M}
                  fill="transparent"
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${SEVERITY_LABEL[detection.severity]} ${detection.issue.name}${
                    detection.row != null ? `, row ${detection.row}` : ''
                  }${done ? ', inspected' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(selected ? null : detection.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(selected ? null : detection.id);
                    }
                  }}
                />
              </g>
            );
          })
        }
      </FieldCanvas>

      <MapLegend items={legend} />
    </div>
  );
}
