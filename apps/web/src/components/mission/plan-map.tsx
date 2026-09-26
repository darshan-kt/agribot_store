'use client';

import type { ApiDetection, ApiFieldDetail, ApiSeverity, ApiSprayEvent } from '@agri/contracts';
import { cn, SEVERITY_LABEL } from '@agri/ui';

import { FieldCanvas, MapLegend, type MapLegendItem } from '@/components/map/field-canvas';
import type { LatLon } from '@/lib/geo';
import type { PlannedWaypoint } from '@/lib/mission/plan';
import { coverageRadiusM } from '@/lib/mission/sprayer';

/**
 * The plan, over the field.
 *
 * Four layers, in the order they are drawn: where the sprayer has already been, the route
 * the robot would take, the plants that are flagged, and the waypoints themselves. The
 * ordering is the point — a waypoint must never disappear under a coverage disc, and the
 * route has to be readable across the plants it passes.
 *
 * **Treated plants are green because a spray event says so.** Each disc and each green dot
 * comes from a `spray_events` row the robot recorded on the last run, with the litres and
 * nozzle height it actually used; the disc radius is that run's nozzle height through the
 * rig's cone angle. Nothing here is a prediction of what the sprayer would do.
 *
 * In "draw it yourself" mode a tap on the field adds a waypoint and each waypoint marker
 * removes itself. That is pointer-only by nature, so the panel beside the map carries a
 * keyboard equivalent that adds points at the ends of a chosen row; this map is the
 * picture, and the controls next to it are the controls.
 */

const PIN: Record<ApiSeverity, string> = {
  low: 'fill-low',
  moderate: 'fill-moderate',
  critical: 'fill-critical',
};

export function PlanMap({
  field,
  waypoints,
  detections,
  treatedIds,
  sprayEvents,
  editable = false,
  onPickPoint,
  onRemoveWaypoint,
  className,
}: {
  field: ApiFieldDetail;
  waypoints: readonly PlannedWaypoint[];
  /** Flagged plants from the latest scouting run — what auto-spray would treat. */
  detections: readonly ApiDetection[];
  /** Ids of plants a recorded spray event already covered. */
  treatedIds: ReadonlySet<string>;
  /** Sprays the robot recorded, drawn as the ground they covered. */
  sprayEvents: readonly ApiSprayEvent[];
  /** True in "draw it yourself" mode: the map accepts and removes points. */
  editable?: boolean | undefined;
  onPickPoint?: ((point: LatLon) => void) | undefined;
  onRemoveWaypoint?: ((index: number) => void) | undefined;
  className?: string | undefined;
}) {
  const pinned = detections.filter(
    (d): d is ApiDetection & { location: LatLon } => d.location != null,
  );
  const treatedCount = pinned.filter((d) => treatedIds.has(d.id)).length;

  const legend: MapLegendItem[] = [];
  if (waypoints.length > 0) {
    legend.push({ mark: 'line', className: 'stroke-info', label: 'Route' });
  }
  if (sprayEvents.length > 0) {
    legend.push({ mark: 'ring', className: 'stroke-primary', label: 'Sprayed' });
  }
  if (treatedCount > 0) {
    legend.push({ mark: 'dot', className: 'fill-primary', label: 'Treated' });
  }
  legend.push(
    ...(['critical', 'moderate', 'low'] as const)
      .filter((severity) => pinned.some((d) => !treatedIds.has(d.id) && d.severity === severity))
      .map((severity) => ({
        mark: 'dot' as const,
        className: PIN[severity],
        label: SEVERITY_LABEL[severity],
      })),
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <FieldCanvas
        field={field}
        // Same row spread as Crop Watch: nine rows in a 100 x 16 m block are otherwise a
        // few pixels apart. No aerial ground here, though — "Treated" is a green dot, and
        // a green dot on a green canopy is the one mark on this map that must stay
        // countable.
        rowSpread={3}
        points={[
          ...pinned.map((d) => d.location),
          ...waypoints,
          ...sprayEvents.map((e) => e.location),
        ]}
        label={routeLabel(field, waypoints.length, pinned.length, treatedCount)}
        onPickPoint={editable ? onPickPoint : undefined}
      >
        {(projection) => (
          <>
            {sprayEvents.map((event) => (
              <circle
                key={event.id}
                cx={projection.toX(event.location)}
                cy={projection.toY(event.location)}
                r={coverageRadiusM(event.nozzle_height_cm)}
                className="fill-primary-soft stroke-primary"
                strokeWidth="0.12"
                opacity="0.75"
              />
            ))}

            {waypoints.length > 1 && (
              <polyline
                points={waypoints
                  .map((w) => `${projection.toX(w).toFixed(2)},${projection.toY(w).toFixed(2)}`)
                  .join(' ')}
                fill="none"
                className="stroke-info"
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {pinned.map((detection) => {
              const treated = treatedIds.has(detection.id);
              return (
                <circle
                  key={detection.id}
                  cx={projection.toX(detection.location)}
                  cy={projection.toY(detection.location)}
                  r={0.9}
                  className={treated ? 'fill-primary' : PIN[detection.severity]}
                  aria-hidden
                />
              );
            })}

            {waypoints.map((waypoint, index) => {
              const x = projection.toX(waypoint);
              const y = projection.toY(waypoint);
              const first = index === 0;

              if (!editable) {
                return (
                  <circle
                    key={waypoint.seq}
                    cx={x}
                    cy={y}
                    r={first ? 1.4 : 0.7}
                    className={cn('stroke-surface', first ? 'fill-info' : 'fill-info')}
                    strokeWidth={first ? 0.5 : 0.25}
                    aria-hidden
                  />
                );
              }

              return (
                <g key={waypoint.seq}>
                  {/* The darker info step, not the route's own: these carry a numeral,
                      and white on the lighter fill measures 4.45:1. */}
                  <circle
                    cx={x}
                    cy={y}
                    r={1.8}
                    className="fill-info-hover stroke-surface cursor-pointer"
                    strokeWidth="0.5"
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove point ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveWaypoint?.(index);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRemoveWaypoint?.(index);
                      }
                    }}
                  />
                  <text
                    x={x}
                    y={y}
                    className="fill-on-info pointer-events-none font-mono"
                    fontSize="1.9"
                    textAnchor="middle"
                    dominantBaseline="central"
                    aria-hidden
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </FieldCanvas>

      <MapLegend items={legend} />
    </div>
  );
}

function routeLabel(
  field: ApiFieldDetail,
  waypointCount: number,
  flagged: number,
  treated: number,
): string {
  const route = waypointCount > 0 ? `route of ${waypointCount} points` : 'no route planned';
  return `Field ${field.name}: ${route}, ${flagged} plants flagged, ${treated} already treated`;
}
