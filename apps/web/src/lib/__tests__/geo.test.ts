/**
 * The projection is checked against the seeded field, whose real dimensions are known:
 * B-4 is nine 100 m rows. If the maths drifts, the map stops matching the ground.
 */
import type { ApiFieldDetail } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import fieldJson from '@/lib/fixtures/field.json';
import { bearingDeg, distanceM, localFrameOf, pointOf, pointsOf, polygonPoints } from '@/lib/geo';

const field = fieldJson as ApiFieldDetail;

describe('pointOf', () => {
  it('reads GeoJSON lon-first', () => {
    expect(pointOf([5.662, 51.984])).toEqual({ lon: 5.662, lat: 51.984 });
  });
});

describe('localFrameOf', () => {
  it('measures the seeded field at its real size', () => {
    const frame = localFrameOf(polygonPoints(field.boundary));
    // 9 rows at 2 m spacing plus a margin, and rows 100 m long.
    expect(frame.widthM).toBeGreaterThan(14);
    expect(frame.widthM).toBeLessThan(18);
    expect(frame.heightM).toBeGreaterThan(100);
    expect(frame.heightM).toBeLessThan(106);
  });

  it('puts the origin at the south-west corner, so offsets are never negative', () => {
    const points = polygonPoints(field.boundary);
    const frame = localFrameOf(points);
    for (const point of points) {
      const { east, north } = frame.offsetOf(point);
      expect(east).toBeGreaterThanOrEqual(-1e-6);
      expect(north).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('pads in metres on every side', () => {
    const bare = localFrameOf(polygonPoints(field.boundary));
    const padded = localFrameOf(polygonPoints(field.boundary), 4);
    expect(padded.widthM).toBeCloseTo(bare.widthM + 8, 3);
    expect(padded.heightM).toBeCloseTo(bare.heightM + 8, 3);
  });

  it('stays drawable when there is no geometry at all', () => {
    // A frame of zero extent divides by zero in every caller that scales by it.
    const frame = localFrameOf([]);
    expect(frame.widthM).toBeGreaterThan(0);
    expect(frame.heightM).toBeGreaterThan(0);
  });
});

describe('field rows', () => {
  it('measures each seeded row at the 100 m the seed recorded', () => {
    for (const row of field.rows ?? []) {
      const [start, end] = pointsOf(row.path.coordinates);
      expect(distanceM(start!, end!)).toBeCloseTo(row.length_m ?? 0, 0);
    }
  });

  it('spaces the rows evenly across the field', () => {
    const rows = field.rows ?? [];
    const frame = localFrameOf(rows.flatMap((r) => pointsOf(r.path.coordinates)));
    const eastings = rows.map((r) => frame.offsetOf(pointOf(r.path.coordinates[0]!)).east);
    const gaps = eastings.slice(1).map((e, i) => e - eastings[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 3);
  });
});

describe('pointAt', () => {
  it('is the exact inverse of offsetOf, which is what tap-to-draw depends on', () => {
    const frame = localFrameOf(polygonPoints(field.boundary), 4);
    for (const row of field.rows ?? []) {
      for (const point of pointsOf(row.path.coordinates)) {
        const back = frame.pointAt(frame.offsetOf(point));
        // A millimetre at this latitude is 1e-8 degrees; the RTK fix is 20 000 times
        // coarser, so anything tighter than this is measuring floating point, not ground.
        expect(back.lat).toBeCloseTo(point.lat, 9);
        expect(back.lon).toBeCloseTo(point.lon, 9);
      }
    }
  });

  it('lands a tap inside the field back inside the field', () => {
    const frame = localFrameOf(polygonPoints(field.boundary));
    const middle = frame.pointAt({ east: frame.widthM / 2, north: frame.heightM / 2 });
    const corners = polygonPoints(field.boundary);
    expect(middle.lat).toBeGreaterThan(Math.min(...corners.map((c) => c.lat)));
    expect(middle.lat).toBeLessThan(Math.max(...corners.map((c) => c.lat)));
    expect(middle.lon).toBeGreaterThan(Math.min(...corners.map((c) => c.lon)));
    expect(middle.lon).toBeLessThan(Math.max(...corners.map((c) => c.lon)));
  });
});

describe('bearingDeg', () => {
  it('reads as a compass: north is 0, east is 90', () => {
    const origin = { lat: 51.984, lon: 5.662 };
    expect(bearingDeg(origin, { lat: 51.985, lon: 5.662 })).toBeCloseTo(0, 3);
    expect(bearingDeg(origin, { lat: 51.984, lon: 5.663 })).toBeCloseTo(90, 3);
    expect(bearingDeg(origin, { lat: 51.983, lon: 5.662 })).toBeCloseTo(180, 3);
    expect(bearingDeg(origin, { lat: 51.984, lon: 5.661 })).toBeCloseTo(270, 3);
  });

  it('runs the seeded rows due north, which is how the field was laid out', () => {
    for (const row of field.rows ?? []) {
      const [start, end] = pointsOf(row.path.coordinates);
      expect(bearingDeg(start!, end!)).toBeCloseTo(0, 3);
    }
  });

  it('never returns 360, so a heading is always in the range the contract allows', () => {
    const origin = { lat: 51.984, lon: 5.662 };
    expect(bearingDeg(origin, origin)).toBe(0);
    for (let step = 0; step < 36; step += 1) {
      const angle = (step * 10 * Math.PI) / 180;
      const target = {
        lat: origin.lat + Math.cos(angle) * 1e-4,
        lon: origin.lon + Math.sin(angle) * 1e-4,
      };
      const bearing = bearingDeg(origin, target);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    }
  });
});
