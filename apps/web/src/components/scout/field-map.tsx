'use client';

import type { ApiDetection, ApiFieldDetail, ApiSeverity } from '@agri/contracts';
import { cn, SEVERITY_LABEL } from '@agri/ui';

import { FieldCanvas, MapLegend, type MapLegendItem } from '@/components/map/field-canvas';
import { type LatLon, pointsOf } from '@/lib/geo';

/**
 * The scouting map: where each flagged plant is, and the order they were found in.
 *
 * The field itself, the rotation and the projection belong to FieldCanvas, which Mission
 * Planner draws on too. What is here is what is specific to scouting.
 *
 * STUBBED: the robot's live pose arrives on the `pose` WebSocket channel at 10 Hz, and
 * that gateway is not built. Until it is, `simulatedPose` places a stand-in marker on the
 * row the robot last reported, so the map has a machine on it to design and demo against.
 * It is drawn in a colour no detection uses, carries "simulated" in its own accessible
 * name, and says so in the legend — because the one thing this marker must never do is
 * get mistaken for a fix. When the pose channel lands, this prop is where it arrives.
 */

const PIN: Record<ApiSeverity, string> = {
  low: 'fill-low',
  moderate: 'fill-moderate',
  critical: 'fill-critical',
};

export function FieldMap({
  field,
  detections,
  selectedId,
  onSelect,
  reportedRow,
  simulatedPose = null,
  className,
}: {
  field: ApiFieldDetail;
  /** The run's detections. Ordered newest first by the report; the path re-sorts. */
  detections: readonly ApiDetection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Row the robot says it is in, from its last state message. Null if it did not say. */
  reportedRow?: number | null;
  /**
   * A stand-in position while the pose channel does not exist: which row, and how far
   * along it as a fraction from the row's first point. Not a fix, and labelled as such.
   */
  simulatedPose?: { row: number; along: number } | null;
  className?: string;
}) {
  const pinned = detections.filter(
    (d): d is ApiDetection & { location: LatLon } => d.location != null,
  );

  // Severity only. The trace, the reported row and the robot each explained themselves
  // in a sentence, and four sentences under a map is more reading than the map itself.
  // What they mark stays drawn, and stays named to a screen reader.
  const legend: MapLegendItem[] = (['critical', 'moderate', 'low'] as const).map((severity) => ({
    mark: 'dot' as const,
    className: PIN[severity],
    label: SEVERITY_LABEL[severity],
  }));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <FieldCanvas
        field={field}
        aerial
        rowSpread={3}
        points={pinned.map((d) => d.location)}
        label={`Field ${field.name}: ${field.rows?.length ?? 0} rows, ${pinned.length} plants flagged`}
        highlightRow={reportedRow}
        onBackgroundClick={() => onSelect(null)}
      >
        {(projection) => {
          // The order detections were recorded in is the order the robot passed them, so
          // joining them traces where it went. It is evidence of a path, not a logged
          // trajectory — the driven track comes from `pose`, which is not being recorded
          // yet — so it is drawn dashed and labelled as what it is.
          const trace = [...pinned]
            .sort((a, b) => Date.parse(a.detected_at) - Date.parse(b.detected_at))
            .map(
              (d) =>
                `${projection.toX(d.location).toFixed(2)},${projection.toY(d.location).toFixed(2)}`,
            )
            .join(' ');

          return (
            <>
              {pinned.length > 1 && (
                <polyline
                  points={trace}
                  fill="none"
                  className="stroke-ink-subtle"
                  strokeWidth="0.35"
                  strokeDasharray="1.6 1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
              )}

              {pinned.map((detection) => {
                const selected = detection.id === selectedId;
                return (
                  <circle
                    key={detection.id}
                    cx={projection.toX(detection.location)}
                    cy={projection.toY(detection.location)}
                    r={selected ? 2.2 : 1.3}
                    className={cn(
                      PIN[detection.severity],
                      'stroke-surface cursor-pointer',
                      'motion-safe:duration-fast motion-safe:transition-[r]',
                    )}
                    strokeWidth={selected ? 0.7 : 0.35}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`${SEVERITY_LABEL[detection.severity]} ${detection.issue.name}${
                      detection.row != null ? `, row ${detection.row}` : ''
                    }`}
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
                );
              })}

              {simulatedPose && <RobotMarker field={field} pose={simulatedPose} projection={projection} />}
            </>
          );
        }}
      </FieldCanvas>

      <MapLegend items={legend} />
    </div>
  );
}


/**
 * Where the robot is standing in, drawn on its reported row.
 *
 * Heading is not guessed: after the canvas's quarter turn, screen +x is north and the
 * rows run along it, so a robot working a row is pointing one way or the other along
 * that axis. It is drawn pointing up-row, which is the direction a scouting pass runs.
 *
 * The ring is the only ambient motion on this map and it is gated on motion-safe, like
 * every other animation in the product.
 */
function RobotMarker({
  field,
  pose,
  projection,
}: {
  field: ApiFieldDetail;
  pose: { row: number; along: number };
  projection: { toX(p: LatLon): number; toY(p: LatLon): number };
}) {
  const row = (field.rows ?? []).find((r) => r.row_number === pose.row);
  const path = row ? pointsOf(row.path.coordinates) : [];
  const first = path[0];
  const last = path[path.length - 1];
  if (!first || !last) return null;

  const x1 = projection.toX(first);
  const x2 = projection.toX(last);
  const along = Math.min(Math.max(pose.along, 0), 1);
  const x = x1 + (x2 - x1) * along;
  const y = projection.toY(first);
  // Point the way the row runs, so the rig is not facing across its own bed.
  const facing = x2 >= x1 ? 1 : -1;

  return (
    <g
      role="img"
      aria-label={`Robot, simulated position on row ${pose.row}. Not a satellite fix.`}
    >
      <circle
        cx={x}
        cy={y}
        r="2.6"
        className="fill-info motion-safe:animate-ping-slow"
        opacity="0.45"
      />
      <circle cx={x} cy={y} r="1.7" className="fill-info stroke-surface" strokeWidth="0.45" />
      <path
        d={`M ${x + facing * 3.4} ${y} L ${x + facing * 1.5} ${y - 1.15} L ${x + facing * 1.5} ${y + 1.15} Z`}
        className="fill-info stroke-surface"
        strokeWidth="0.3"
        strokeLinejoin="round"
      />
    </g>
  );
}
