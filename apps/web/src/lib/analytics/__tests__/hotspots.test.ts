/**
 * Hotspots against the seeded week of scouting.
 *
 * The grouping rule stands in for a PostGIS query that does not exist yet, so what is
 * checked here is that it behaves like the thing it stands in for: same issue only,
 * bounded in size, worst first, and every plant accounted for exactly once.
 */
import type { ApiDetection } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import { clusterHotspots, HOTSPOT_RADIUS_M, rowRangeLabel } from '@/lib/analytics/hotspots';
import detectionsJson from '@/lib/fixtures/detections.json';
import { distanceM } from '@/lib/geo';

const detections = (detectionsJson as { detections: ApiDetection[] }).detections;
const hotspots = clusterHotspots(detections);

describe('clusterHotspots', () => {
  it('groups the seeded findings into far fewer places than plants', () => {
    // 161 plants is a list nobody walks. The point of the grouping is that the number of
    // places to visit is small enough to plan a morning around.
    expect(detections.length).toBeGreaterThan(100);
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots.length).toBeLessThan(detections.length / 4);
  });

  it('produces patches rather than a list of single plants wearing the word', () => {
    // The failure mode of too small a radius: most "hotspots" hold one plant, and the
    // grouping has told the operator nothing they did not already have.
    const singletons = hotspots.filter((hotspot) => hotspot.detection_count === 1);
    expect(singletons.length).toBeLessThan(hotspots.length / 3);

    const sizes = hotspots.map((hotspot) => hotspot.detection_count).sort((a, b) => a - b);
    expect(sizes[Math.floor(sizes.length / 2)]).toBeGreaterThanOrEqual(3);
  });

  it('accounts for every plant that has a position, exactly once', () => {
    const located = detections.filter((detection) => detection.location != null);
    const grouped = hotspots.reduce((sum, hotspot) => sum + hotspot.detection_count, 0);
    expect(grouped).toBe(located.length);
  });

  it('never mixes two different problems into one hotspot', () => {
    // A patch of blight and a patch of aphids in the same corner are two visits with two
    // different remedies, and merging them would recommend the wrong one.
    for (const hotspot of hotspots) {
      const members = detections.filter(
        (detection) =>
          detection.location != null &&
          distanceM(detection.location, hotspot.centre) <= HOTSPOT_RADIUS_M &&
          detection.issue.code === hotspot.issue.code,
      );
      expect(members.length).toBeGreaterThanOrEqual(1);
    }
    const codes = new Set(hotspots.map((hotspot) => hotspot.issue.code));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('orders them the way they should be dealt with: worst first', () => {
    const rank = { critical: 3, moderate: 2, low: 1 } as const;
    const ranks = hotspots.map((hotspot) => rank[hotspot.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it('takes its severity from the worst plant in the group, not an average', () => {
    for (const hotspot of hotspots.filter((h) => h.severity === 'critical')) {
      const members = detections.filter(
        (detection) =>
          detection.location != null &&
          detection.issue.code === hotspot.issue.code &&
          distanceM(detection.location, hotspot.centre) <= HOTSPOT_RADIUS_M,
      );
      expect(members.some((member) => member.severity === 'critical')).toBe(true);
    }
  });

  it('gives every hotspot an id that survives a re-render', () => {
    const again = clusterHotspots(detections);
    expect(again.map((h) => h.id)).toEqual(hotspots.map((h) => h.id));
    expect(new Set(hotspots.map((h) => h.id)).size).toBe(hotspots.length);
  });

  it('names a sample plant that is in the field it points at', () => {
    for (const hotspot of hotspots) {
      const sample = detections.find((detection) => detection.id === hotspot.sample_detection_id);
      expect(sample).toBeDefined();
      expect(sample!.issue.code).toBe(hotspot.issue.code);
    }
  });

  it('leaves out plants with no position rather than placing them at random', () => {
    const noPosition: ApiDetection = {
      ...detections[0]!,
      id: 'no-position',
      location: null,
    };
    const result = clusterHotspots([...detections, noPosition]);
    expect(result.reduce((sum, h) => sum + h.detection_count, 0)).toBe(
      detections.filter((d) => d.location != null).length,
    );
  });

  it('returns nothing at all for nothing at all', () => {
    expect(clusterHotspots([])).toEqual([]);
  });
});

describe('rowRangeLabel', () => {
  it('says a range when the rows run together', () => {
    expect(rowRangeLabel([6, 7, 8, 9])).toBe('Rows 6 to 9');
  });

  it('lists them when they do not, rather than sending someone down empty rows', () => {
    expect(rowRangeLabel([2, 5, 9])).toBe('Rows 2, 5, 9');
  });

  it('handles one row and none', () => {
    expect(rowRangeLabel([4])).toBe('Row 4');
    expect(rowRangeLabel([])).toBeNull();
  });
});
