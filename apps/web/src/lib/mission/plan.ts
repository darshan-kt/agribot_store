/**
 * Planning a mission: turning a pattern into the waypoints a robot would drive.
 *
 * Pure functions, separate from the React that calls them, for the same reason teleop is:
 * this decides where a machine goes, and it has to be testable without a DOM.
 *
 * Two things are deliberate here.
 *
 * **The patterns are expanded from the field's real geometry**, not drawn by eye. A snake
 * is the seeded rows walked end to end in the order they are numbered, alternating
 * direction; a perimeter is the boundary polygon inset by the robot's turning clearance.
 * Both come out of PostGIS geometry that the robot's own navigation stack works in.
 *
 * **The backend expands patterns too, and it is the one that counts.** `cmd/mission` says
 * snake and perimeter are expanded server-side so the robot receives one uniform
 * representation. What is computed here is a preview: it exists so the operator can see
 * the route, its length and its duration before committing, and so a custom route has
 * something to be drawn into. `missionInputFor` sends the *pattern* for snake and
 * perimeter and the explicit points only for custom, exactly as MissionInput specifies.
 */

import type { ApiFieldDetail, ApiMissionInput } from '@agri/contracts';

import { bearingDeg, distanceM, type LatLon, lerpPoint, pointsOf, polygonPoints } from '@/lib/geo';

export type PlanPattern = 'snake' | 'perimeter' | 'custom';

export interface PlannedWaypoint extends LatLon {
  seq: number;
  /** Compass heading the robot should hold arriving at this point, or null at the end
   *  of the route where there is no next leg to face. */
  heading_deg: number | null;
}

export const PLAN_PATTERNS: Record<PlanPattern, { label: string; hint: string }> = {
  snake: {
    label: 'Snake the rows',
    hint: 'Up one row and down the next, until every row is covered.',
  },
  perimeter: {
    label: 'Follow the edge',
    hint: 'One lap of the field boundary. Useful for a boundary check or a headland pass.',
  },
  custom: {
    label: 'Draw it yourself',
    hint: 'Tap the map to drop points. The robot drives them in the order you place them.',
  },
};

export const PLAN_PATTERN_ORDER: readonly PlanPattern[] = ['snake', 'perimeter', 'custom'] as const;

/** Clearance kept inside the boundary on a perimeter lap. The robot is about a metre
 *  wide and has to turn at the corners without putting a wheel over the edge. */
export const PERIMETER_INSET_M = 1.5;

/**
 * Number a list of coordinates as a route, facing each point at the next one.
 *
 * The last waypoint has no next leg, so its heading is null rather than a repeat of the
 * previous one — a heading the planner invented is a heading the robot would turn to.
 */
export function asRoute(points: readonly LatLon[]): PlannedWaypoint[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    return {
      seq: index,
      lat: point.lat,
      lon: point.lon,
      heading_deg: next ? bearingDeg(point, next) : null,
    };
  });
}

/**
 * The snake: every row walked end to end, alternating direction.
 *
 * Rows are taken in their numbered order — which is the order they sit across the field —
 * so the robot never crosses the field to reach the next one. Even rows are reversed, so
 * each row starts where the last one finished.
 */
export function snakeWaypoints(field: ApiFieldDetail): PlannedWaypoint[] {
  const rows = [...(field.rows ?? [])].sort((a, b) => a.row_number - b.row_number);
  const points: LatLon[] = [];

  rows.forEach((row, index) => {
    const path = pointsOf(row.path.coordinates);
    if (path.length < 2) return;
    const ends = index % 2 === 0 ? path : [...path].reverse();
    points.push(...ends);
  });

  return asRoute(points);
}

/**
 * One lap of the boundary, inset by the turning clearance.
 *
 * The inset is toward the polygon's own centroid rather than a true offset curve: the
 * field is a convex rectangle, where the two agree, and an offset-curve implementation
 * would be machinery for a shape this product does not have.
 */
export function perimeterWaypoints(
  field: ApiFieldDetail,
  insetM = PERIMETER_INSET_M,
): PlannedWaypoint[] {
  const ring = polygonPoints(field.boundary);
  // GeoJSON rings repeat the first vertex to close. Drop it; the lap is closed below by
  // returning to the start, which is a leg the robot drives rather than a duplicate stop.
  const corners = dropClosingVertex(ring);
  if (corners.length < 3) return [];

  const centroid = meanPoint(corners);
  const inset = corners.map((corner) => {
    const span = distanceM(corner, centroid);
    // A field smaller than twice the clearance has no inside left to drive; stay on the
    // vertex rather than folding the route through the middle of it.
    const t = span > 0 ? Math.min(insetM / span, 0.5) : 0;
    return lerpPoint(corner, centroid, t);
  });

  const first = inset[0];
  return asRoute(first ? [...inset, first] : inset);
}

/** The route for a pattern. Custom routes are the operator's own points, untouched. */
export function waypointsFor(
  pattern: PlanPattern,
  field: ApiFieldDetail,
  custom: readonly LatLon[] = [],
): PlannedWaypoint[] {
  switch (pattern) {
    case 'snake':
      return snakeWaypoints(field);
    case 'perimeter':
      return perimeterWaypoints(field);
    case 'custom':
      return asRoute(custom);
  }
}

/** Total driven distance of a route in metres. */
export function routeLengthM(waypoints: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    if (from && to) total += distanceM(from, to);
  }
  return total;
}

/**
 * Driving time at a speed, in seconds — and nothing else.
 *
 * Turns, the pauses a vision pipeline takes at a plant, and anything the operator does
 * mid-run are not in here, and the UI labels the figure as driving time so it is not read
 * as a finish time. The one recorded run in the seed bears that out: 900 m at 0.8 m/s is
 * 19 minutes of driving inside a run that took 47.
 */
export function drivingSecondsFor(lengthM: number, speedMps: number): number {
  if (speedMps <= 0) return 0;
  return lengthM / speedMps;
}

export function formatDuration(seconds: number): string {
  // Rounded to the nearest minute, not floored: a run of 18 minutes 45 seconds is
  // nineteen minutes of someone's afternoon, and rounding a duration down understates
  // every estimate the operator plans around.
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Append a tapped coordinate to a custom route. */
export function withWaypointAdded(points: readonly LatLon[], point: LatLon): LatLon[] {
  return [...points, point];
}

/** Remove one waypoint. The rest close up; `asRoute` renumbers on the way out, so seq
 *  stays contiguous and no gap is ever sent to a robot. */
export function withWaypointRemoved(points: readonly LatLon[], index: number): LatLon[] {
  return points.filter((_, i) => i !== index);
}

/**
 * The body that would be POSTed to `/missions`.
 *
 * Built by a pure function so the request is real and type-checked against the contract
 * even though nothing answers it yet — when the backend lands, the wiring is a fetch call
 * around this, not a rewrite of the planner.
 */
export function missionInputFor({
  robotId,
  fieldId,
  name,
  mode,
  pattern,
  speedMps,
  autoSpray,
  waypoints,
}: {
  robotId: string;
  fieldId: string | null;
  name: string;
  mode: 'autonomous' | 'remote_control';
  pattern: PlanPattern;
  speedMps: number;
  autoSpray: boolean;
  waypoints: readonly PlannedWaypoint[];
}): ApiMissionInput {
  const input: ApiMissionInput = {
    robot_id: robotId,
    field_id: fieldId,
    name,
    mode,
    speed_mps: speedMps,
    auto_spray: autoSpray,
  };

  if (mode === 'remote_control') return input;

  input.pattern = pattern;
  // Snake and perimeter are expanded server-side from the same field geometry, so
  // sending this preview's points would be sending the robot a second opinion.
  if (pattern === 'custom') {
    input.waypoints = waypoints.map(({ seq, lat, lon, heading_deg }) => ({
      seq,
      lat,
      lon,
      heading_deg,
    }));
  }
  return input;
}

function dropClosingVertex(ring: readonly LatLon[]): LatLon[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && first.lat === last.lat && first.lon === last.lon) {
    return ring.slice(0, -1);
  }
  return [...ring];
}

function meanPoint(points: readonly LatLon[]): LatLon {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}
