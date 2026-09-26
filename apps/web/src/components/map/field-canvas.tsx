'use client';

import type { ApiFieldDetail } from '@agri/contracts';
import { cn } from '@agri/ui';
import { type ReactNode, useId } from 'react';

import { type LatLon, localFrameOf, pointsOf, polygonPoints } from '@/lib/geo';

/**
 * The field, drawn from its real geometry. Shared by every map surface in the product.
 *
 * **Rotated a quarter turn on purpose.** B-4 is about 16 m wide and 100 m long with its
 * rows running north–south, so drawn north-up it is a sliver two characters wide. The map
 * is therefore rotated clockwise: north points right, the 100 m rows run across the
 * panel, and rows 1 to 9 stack down the side in the order they are numbered. It is a
 * rotation, not a mirror, so left and right on screen still mean west and east of the
 * heading — and the compass mark says which way north is, because an operator standing in
 * the field is going to check it against the sun.
 *
 * The canvas owns the projection and the field furniture — boundary, rows, row numbers,
 * compass, scale. What goes on top is the caller's: Crop Scout draws detections, Mission
 * Planner draws a route and where it sprayed. Both get the same frame, so a plant is in
 * the same place in both apps.
 *
 * One SVG user unit is one metre, which is why a spray radius or a row width can be
 * written straight into an attribute with no conversion at the call site.
 *
 * MapLibre is in the approved stack and is not used here. There is no tile source
 * configured in this project and no imagery to put under the field, so it would render
 * the same nine lines through WebGL, at the cost of a dependency that cannot draw
 * anything offline in a field with no signal. See docs/PLAN.md.
 */

/** Metres of margin inside the panel, so a marker on the boundary is not half cut off. */
export const MAP_PADDING_M = 4;

export interface MapProjection {
  /** Screen-x extent in metres — the field's north–south run, after the rotation. */
  spanX: number;
  /** Screen-y extent in metres — the field's east–west run. */
  spanY: number;
  toX(point: LatLon): number;
  toY(point: LatLon): number;
  /** A position in the drawing, back as a place. Tap-to-draw depends on it. */
  at(x: number, y: number): LatLon;
}

export function FieldCanvas({
  field,
  points = [],
  label,
  highlightRow,
  highlightRowClassName = 'stroke-primary',
  onBackgroundClick,
  onPickPoint,
  aerial = false,
  rowSpread = 1,
  paddingM = MAP_PADDING_M,
  scaleMetres = 20,
  className,
  children,
}: {
  field: ApiFieldDetail;
  /** Extra coordinates the frame must contain, so nothing the caller draws falls outside. */
  points?: readonly LatLon[] | undefined;
  label: string;
  /** A row to pick out, by number. */
  highlightRow?: number | null | undefined;
  highlightRowClassName?: string | undefined;
  /** Called when the background — not a marker — is clicked. */
  onBackgroundClick?: (() => void) | undefined;
  /** Called with the coordinate under the pointer. Present only in tap-to-draw mode. */
  onPickPoint?: ((point: LatLon) => void) | undefined;
  /**
   * Draw the field as it looks from above — soil and canopy — instead of on the bare
   * panel surface. Opt-in: Crop Scout uses it so the operator is looking at something
   * shaped like the block they are standing in, while Mission Planner keeps the plain
   * ground, where a route and its spray marks have to stay the most legible thing on
   * the panel.
   */
  aerial?: boolean | undefined;
  /**
   * Exaggerate the gap between rows by this factor.
   *
   * B-4 is 100 m by 16 m, so drawn true to scale it is a letterbox strip in which nine
   * rows are a few pixels apart and their numbers collide. Spreading them in the
   * projection — rather than stretching the rendered SVG — is what keeps the row labels,
   * the plant pins and the robot marker undistorted: the SVG still scales uniformly, it
   * is the coordinate space underneath that is taller.
   *
   * The cost is that vertical distance is no longer to scale. Horizontal distance still
   * is, which is what the scale bar measures and what "98 m down row 7" means.
   */
  rowSpread?: number | undefined;
  paddingM?: number | undefined;
  scaleMetres?: number | undefined;
  className?: string | undefined;
  children?: ((projection: MapProjection) => ReactNode) | undefined;
}) {
  const rows = field.rows ?? [];

  const frame = localFrameOf(
    [
      ...polygonPoints(field.boundary),
      ...rows.flatMap((row) => pointsOf(row.path.coordinates)),
      ...points,
    ],
    paddingM,
  );

  // After the quarter turn: screen x runs north, screen y runs east. Everything below
  // goes through these, so the rotation is stated once and only once.
  const spread = Math.max(rowSpread, 1);
  const projection: MapProjection = {
    spanX: frame.heightM,
    spanY: frame.widthM * spread,
    toX: (p) => frame.offsetOf(p).north,
    toY: (p) => frame.offsetOf(p).east * spread,
    // Inverse of the spread, so a tapped point still comes back as the place it is.
    at: (x, y) => frame.pointAt({ north: x, east: y / spread }),
  };

  // Scoped so two maps on one page cannot capture each other's paint servers.
  const uid = useId().replace(/:/g, '');
  const canopyId = `canopy-${uid}`;
  const clipId = `field-${uid}`;

  const boundary = polygonPoints(field.boundary)
    .map((p) => `${projection.toX(p).toFixed(2)},${projection.toY(p).toFixed(2)}`)
    .join(' ');

  return (
    <div
      className={cn(
        'border-line bg-surface-sunk relative overflow-hidden rounded-md border',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${projection.spanX} ${projection.spanY}`}
        className={cn('block w-full', onPickPoint && 'cursor-crosshair')}
        // Rows must stay parallel and evenly spaced; a stretched field would make the
        // gap between row 1 and row 2 look different from the gap between 8 and 9.
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
        onClick={(event) => {
          // Every interactive marker stops propagation, so a click that reaches here hit
          // the field itself — the boundary fill, a row, or the space around them. It
          // cannot be a test of event.target: the boundary polygon covers the whole
          // field, which is precisely where someone tapping to place a waypoint taps.
          onBackgroundClick?.();
          if (!onPickPoint) return;
          const picked = coordinateAt(
            event.currentTarget,
            event.clientX,
            event.clientY,
            projection,
          );
          if (picked) onPickPoint(picked);
        }}
      >
        {aerial && (
          <AerialGround
            rows={rows}
            projection={projection}
            boundary={boundary}
            canopyId={canopyId}
            clipId={clipId}
          />
        )}

        <polygon
          points={boundary}
          className={aerial ? 'fill-none stroke-line-strong' : 'fill-surface stroke-line-strong'}
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
        />

        {rows.map((row) => {
          const path = pointsOf(row.path.coordinates);
          const first = path[0];
          const last = path[path.length - 1];
          if (!first || !last) return null;
          const highlighted = highlightRow === row.row_number;
          return (
            <g key={row.row_number}>
              <line
                x1={projection.toX(first)}
                y1={projection.toY(first)}
                x2={projection.toX(last)}
                y2={projection.toY(last)}
                className={highlighted ? highlightRowClassName : 'stroke-line-strong'}
                strokeWidth={highlighted ? 1 : 0.5}
                strokeLinecap="round"
                opacity={highlighted ? 0.9 : 0.55}
              />
              <text
                x={projection.toX(first) - 1.5}
                y={projection.toY(first)}
                className="fill-ink-subtle font-mono"
                fontSize="2.4"
                textAnchor="end"
                dominantBaseline="central"
              >
                {row.row_number}
              </text>
            </g>
          );
        })}

        {children?.(projection)}
      </svg>

      <Compass />
      <ScaleBar metres={scaleMetres} spanX={projection.spanX} />
    </div>
  );
}

/**
 * Where a click landed, in field coordinates.
 *
 * `getScreenCTM` is the only thing that knows how `preserveAspectRatio` placed the
 * viewBox inside the rendered box, so the arithmetic is not repeated here. When it is
 * unavailable — jsdom has no layout — this returns null and the caller drops the click.
 * A waypoint placed by guesswork is a place the robot would actually drive to.
 */
function coordinateAt(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  projection: MapProjection,
): LatLon | null {
  if (typeof DOMPoint === 'undefined') return null;
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  if (local.x < 0 || local.y < 0 || local.x > projection.spanX || local.y > projection.spanY) {
    return null;
  }
  return projection.at(local.x, local.y);
}

type FieldRow = NonNullable<ApiFieldDetail['rows']>[number];

/**
 * The field as the drone sees it: soil, and nine bands of canopy over it.
 *
 * This is a *representation*, not imagery — there is no tile source in this project and
 * no photograph of B-4 to load, and a map that silently invents satellite detail would be
 * claiming to show ground truth it does not have. What it does claim is true: the bands
 * are drawn from the field's own row geometry, so a plant pinned on row 7 sits on the
 * seventh green band, and the 20 m scale bar measures it correctly.
 *
 * Built from rects and a tiled pattern rather than a few hundred scattered leaf circles.
 * At 6-7 px per metre a 1.7 m tile reads as foliage granularity, costs five nodes instead
 * of seven hundred, and keeps the SVG light enough to re-render on every selection.
 *
 * Deliberately no <line> elements: the row lines drawn above this are counted by name in
 * the map's tests, and texture must not be mistakable for structure.
 */
function AerialGround({
  rows,
  projection,
  boundary,
  canopyId,
  clipId,
}: {
  rows: readonly FieldRow[];
  projection: MapProjection;
  boundary: string;
  canopyId: string;
  clipId: string;
}) {
  const bands = rows
    .map((row) => {
      const path = pointsOf(row.path.coordinates);
      const first = path[0];
      const last = path[path.length - 1];
      if (!first || !last) return null;
      const x1 = projection.toX(first);
      const x2 = projection.toX(last);
      return {
        row: row.row_number,
        x: Math.min(x1, x2),
        width: Math.abs(x2 - x1),
        y: projection.toY(first),
      };
    })
    .filter((band): band is NonNullable<typeof band> => band !== null);

  if (bands.length === 0) return null;

  // Row pitch, measured rather than assumed: the soil between two rows is whatever the
  // planting left, and the canopy is a little under two thirds of it.
  const ys = bands.map((b) => b.y).sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]!);
  const pitch = gaps.length > 0 ? gaps.reduce((sum, g) => sum + g, 0) / gaps.length : 2;
  const canopyH = pitch * 0.64;

  return (
    <g aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <polygon points={boundary} />
        </clipPath>

        {/* One tile of canopy. Offset, uneven clumps rather than a grid of dots — a
            regular lattice reads as a texture swatch, not as plants. */}
        <pattern id={canopyId} width="1.7" height="1.7" patternUnits="userSpaceOnUse">
          <rect width="1.7" height="1.7" className="fill-canopy" />
          {/* Ellipses, not circles: a circle on this canvas is a plant pin or the robot,
              and the map's tests count them. Texture must not enter that vocabulary —
              and real foliage clumps are not round from above anyway. */}
          <ellipse cx="0.44" cy="0.52" rx="0.46" ry="0.4" className="fill-canopy-light" opacity="0.85" />
          <ellipse cx="1.26" cy="1.18" rx="0.5" ry="0.44" className="fill-canopy-dark" opacity="0.7" />
          <ellipse cx="1.32" cy="0.3" rx="0.3" ry="0.26" className="fill-canopy-light" opacity="0.5" />
          <ellipse cx="0.32" cy="1.42" rx="0.29" ry="0.25" className="fill-canopy-dark" opacity="0.55" />
        </pattern>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect
          x="0"
          y="0"
          width={projection.spanX}
          height={projection.spanY}
          className="fill-soil"
        />

        {/* The wheeling between rows, where the soil is worked darker than the beds. */}
        {bands.map((band) => (
          <rect
            key={`soil-${band.row}`}
            x="0"
            y={band.y + pitch / 2 - pitch * 0.13}
            width={projection.spanX}
            height={pitch * 0.26}
            className="fill-soil-dark"
            opacity="0.55"
          />
        ))}

        {bands.map((band, index) => (
          <rect
            key={`canopy-${band.row}`}
            x={band.x}
            y={band.y - canopyH / 2}
            width={band.width}
            height={canopyH}
            rx={canopyH * 0.34}
            fill={`url(#${canopyId})`}
            // A shade of variation row to row, so nine identical strips do not read as
            // a printed pattern. Deterministic, so the server and the client agree.
            opacity={index % 2 === 0 ? 1 : 0.93}
          />
        ))}
      </g>
    </g>
  );
}

/** North points right after the rotation, and nobody should have to work that out. */
function Compass() {
  return (
    <div
      className="text-ink-subtle text-2xs absolute right-2 top-2 flex items-center gap-1 font-semibold"
      aria-hidden
    >
      <svg viewBox="0 0 16 8" className="w-4">
        <path
          d="M1 4 H13 M10 1.5 L13 4 L10 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      N
    </div>
  );
}

function ScaleBar({ metres, spanX }: { metres: number; spanX: number }) {
  return (
    <div className="absolute bottom-2 left-2 flex flex-col gap-0.5" aria-hidden>
      <div
        className="border-ink-subtle h-1.5 border-x border-b"
        style={{ width: `${(metres / spanX) * 100}%` }}
      />
      <span className="text-ink-subtle text-2xs font-mono">{metres} m</span>
    </div>
  );
}

export type MapLegendItem = {
  /** How the thing is drawn on the map, so the key looks like what it explains. */
  mark: 'dot' | 'ring' | 'line' | 'dash';
  className: string;
  label: string;
};

/** The key under a map. Every mark on a map surface has an entry; an unexplained colour
 *  is a colour an operator has to guess at. */
export function MapLegend({
  items,
  className,
}: {
  items: readonly MapLegendItem[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs',
        className,
      )}
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.mark === 'dot' && (
            <svg viewBox="0 0 8 8" className="size-2" aria-hidden>
              <circle cx="4" cy="4" r="4" className={item.className} />
            </svg>
          )}
          {item.mark === 'ring' && (
            <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
              <circle
                cx="5"
                cy="5"
                r="4"
                fill="none"
                className={item.className}
                strokeWidth="1.5"
              />
            </svg>
          )}
          {item.mark === 'line' && (
            <svg viewBox="0 0 16 2" className="w-4" aria-hidden>
              <line x1="0" y1="1" x2="16" y2="1" className={item.className} strokeWidth="2" />
            </svg>
          )}
          {item.mark === 'dash' && (
            <svg viewBox="0 0 16 2" className="w-4" aria-hidden>
              <line
                x1="0"
                y1="1"
                x2="16"
                y2="1"
                className={item.className}
                strokeWidth="1.5"
                strokeDasharray="3 2.5"
              />
            </svg>
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
