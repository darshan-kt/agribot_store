/**
 * The planner decides where a machine drives, so it is checked against the seeded field
 * rather than against a rectangle invented for the test. B-4 is nine 100 m rows two
 * metres apart; every number below is a consequence of that, and if the geometry or the
 * projection drifts, these stop agreeing with the ground.
 */
import type { ApiFieldDetail } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import fieldJson from '@/lib/fixtures/field.json';
import { distanceM, pointsOf } from '@/lib/geo';
import {
  asRoute,
  drivingSecondsFor,
  formatDuration,
  missionInputFor,
  perimeterWaypoints,
  PERIMETER_INSET_M,
  routeLengthM,
  snakeWaypoints,
  waypointsFor,
  withWaypointAdded,
  withWaypointRemoved,
} from '@/lib/mission/plan';

const field = fieldJson as ApiFieldDetail;
const rows = field.rows ?? [];

describe('snakeWaypoints', () => {
  const snake = snakeWaypoints(field);

  it('visits both ends of every row', () => {
    expect(snake).toHaveLength(rows.length * 2);
  });

  it('numbers the route contiguously from zero', () => {
    expect(snake.map((w) => w.seq)).toEqual(snake.map((_, i) => i));
  });

  it('alternates direction, so each row starts where the last one ended', () => {
    // Rows run south to north. Taken in numbered order and alternating, the route goes
    // north up row 1, south down row 2, north up row 3 — which is the whole point of a
    // snake: no empty transit back to the start of each row.
    const headings = snake.map((w) => w.heading_deg);
    expect(headings[0]).toBeCloseTo(0, 3); // up row 1
    expect(headings[2]).toBeCloseTo(180, 3); // down row 2
    expect(headings[4]).toBeCloseTo(0, 3); // up row 3
  });

  it('crosses to the neighbouring row and never further', () => {
    // The transit legs are the odd-indexed ones: the end of a row to the start of the
    // next. A leg longer than the row spacing would mean the route left the field to get
    // to its next row.
    const spacing = rowSpacingM();
    for (let i = 1; i < snake.length - 1; i += 2) {
      expect(distanceM(snake[i]!, snake[i + 1]!)).toBeLessThanOrEqual(spacing * 1.05);
    }
  });

  it('covers every row once: the route is as long as the rows plus the turns', () => {
    const rowMetres = rows.reduce((sum, row) => sum + (row.length_m ?? 0), 0);
    const length = routeLengthM(snake);
    expect(length).toBeGreaterThanOrEqual(rowMetres);
    // Eight transits at the row spacing is all the extra a snake can need.
    expect(length).toBeLessThanOrEqual(rowMetres + (rows.length - 1) * rowSpacingM() * 1.05);
  });

  it('leaves the last waypoint without a heading, rather than inventing one', () => {
    expect(snake[snake.length - 1]!.heading_deg).toBeNull();
  });
});

describe('perimeterWaypoints', () => {
  const lap = perimeterWaypoints(field);

  it('closes the lap by returning to where it started', () => {
    const first = lap[0]!;
    const last = lap[lap.length - 1]!;
    expect(last.lat).toBeCloseTo(first.lat, 9);
    expect(last.lon).toBeCloseTo(first.lon, 9);
  });

  it('stays inside the boundary by the turning clearance', () => {
    const corners = polygonCorners();
    for (const point of lap) {
      const nearest = Math.min(...corners.map((corner) => distanceM(point, corner)));
      // Every planned point is pulled off its corner, so none sits on the fence line.
      expect(nearest).toBeGreaterThan(PERIMETER_INSET_M * 0.5);
    }
  });

  it('is shorter than the boundary itself, because it is inset', () => {
    const corners = polygonCorners();
    const boundaryLength = routeLengthM([...corners, corners[0]!]);
    expect(routeLengthM(lap)).toBeLessThan(boundaryLength);
  });
});

describe('waypointsFor', () => {
  it('returns the operator’s own points for a custom route, in the order placed', () => {
    const points = [
      { lat: 51.9841, lon: 5.6621 },
      { lat: 51.9845, lon: 5.6621 },
    ];
    const route = waypointsFor('custom', field, points);
    expect(route.map((w) => [w.lat, w.lon])).toEqual(points.map((p) => [p.lat, p.lon]));
  });

  it('gives an empty custom route nothing to drive', () => {
    expect(waypointsFor('custom', field, [])).toEqual([]);
  });
});

describe('editing a custom route', () => {
  const a = { lat: 51.9841, lon: 5.6621 };
  const b = { lat: 51.9845, lon: 5.6621 };
  const c = { lat: 51.9848, lon: 5.6622 };

  it('appends in the order tapped', () => {
    expect(withWaypointAdded([a, b], c)).toEqual([a, b, c]);
  });

  it('closes the gap when a point is removed, leaving no hole in the sequence', () => {
    const remaining = withWaypointRemoved([a, b, c], 1);
    expect(remaining).toEqual([a, c]);
    expect(asRoute(remaining).map((w) => w.seq)).toEqual([0, 1]);
  });

  it('does not mutate the list it was given', () => {
    const original = [a, b];
    withWaypointAdded(original, c);
    withWaypointRemoved(original, 0);
    expect(original).toEqual([a, b]);
  });
});

describe('drivingSecondsFor', () => {
  it('is distance over speed, and nothing else', () => {
    expect(drivingSecondsFor(900, 0.8)).toBeCloseTo(1125, 6);
  });

  it('refuses to divide by a speed of zero', () => {
    expect(drivingSecondsFor(900, 0)).toBe(0);
  });

  it('formats as an operator would read it', () => {
    expect(formatDuration(1125)).toBe('19 min');
    expect(formatDuration(3720)).toBe('1 h 02 min');
  });
});

describe('missionInputFor', () => {
  const base = {
    robotId: 'scout-01',
    fieldId: field.id,
    name: 'B-4 full coverage',
    speedMps: 0.8,
    autoSpray: true,
  };

  it('sends the pattern, not the preview, for a snake', () => {
    const input = missionInputFor({
      ...base,
      mode: 'autonomous',
      pattern: 'snake',
      waypoints: snakeWaypoints(field),
    });
    expect(input.pattern).toBe('snake');
    // The backend expands snake from the same rows. Sending these too would be a second
    // opinion about where the robot goes.
    expect(input.waypoints).toBeUndefined();
  });

  it('sends explicit points for a custom route', () => {
    const waypoints = asRoute([
      { lat: 51.9841, lon: 5.6621 },
      { lat: 51.9845, lon: 5.6621 },
    ]);
    const input = missionInputFor({
      ...base,
      mode: 'autonomous',
      pattern: 'custom',
      waypoints,
    });
    expect(input.waypoints).toHaveLength(2);
    expect(input.waypoints?.[0]).toEqual({
      seq: 0,
      lat: 51.9841,
      lon: 5.6621,
      heading_deg: 0,
    });
  });

  it('carries no route at all in remote control, because there is no route to drive', () => {
    const input = missionInputFor({
      ...base,
      mode: 'remote_control',
      pattern: 'snake',
      waypoints: snakeWaypoints(field),
    });
    expect(input.pattern).toBeUndefined();
    expect(input.waypoints).toBeUndefined();
    expect(input.mode).toBe('remote_control');
  });
});

/** Distance between neighbouring rows, measured from the seeded geometry. */
function rowSpacingM(): number {
  const first = pointsOf(rows[0]!.path.coordinates)[0]!;
  const second = pointsOf(rows[1]!.path.coordinates)[0]!;
  return distanceM(first, second);
}

function polygonCorners() {
  return field.boundary.coordinates[0]!.map((c) => ({ lon: c[0]!, lat: c[1]! }));
}
