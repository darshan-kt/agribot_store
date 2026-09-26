/**
 * Grouping flagged plants into hotspots.
 *
 * A farmer does not walk to 37 plants. They walk to the three patches those plants form,
 * and the walk is worth making because the patches are what a disease actually is —
 * late blight does not appear on one plant, it appears on a group of neighbours in the
 * rows where the air does not move.
 *
 * `GET /analytics/hotspots` is the contract's own endpoint for this and computes the
 * grouping in PostGIS. The rule below is what the fixture source uses instead while that
 * backend is being written, and it is written down rather than improvised so the two can
 * be compared: **same issue, within `HOTSPOT_RADIUS_M` of the group's centre.** Nothing
 * here is used when `NEXT_PUBLIC_DATA_SOURCE=http`.
 */

import type { ApiDetection, ApiHotspot, ApiSeverity } from '@agri/contracts';

import { distanceM, type LatLon } from '@/lib/geo';

/**
 * How far apart two plants can be and still be the same patch.
 *
 * Fifteen metres, which is about the width of the field.
 *
 * That is the load-bearing observation: B-4 is 16 m wide and 100 m long, so there is no
 * useful way to subdivide a hotspot *across* the rows — someone standing in it can reach
 * every row without walking anywhere. The only division that means anything is along the
 * field's length, and a radius near the field's width produces exactly that: a hotspot is
 * a stretch of the field, which is how it gets walked.
 *
 * Measured against the seeded week, the difference is not subtle. At 6 m the 161 findings
 * fall into 66 groups, 32 of them a single plant — a list of plants wearing the word
 * hotspot. At 15 m they fall into 27, median 4 plants, 6 singletons: a morning's work,
 * ordered.
 */
export const HOTSPOT_RADIUS_M = 15;

/** Worst first: the order the list is triaged in. */
const SEVERITY_RANK: Record<ApiSeverity, number> = { critical: 3, moderate: 2, low: 1 };

export type Located = ApiDetection & { location: LatLon };

export function hasLocation(detection: ApiDetection): detection is Located {
  return detection.location != null;
}

/**
 * The hotspots a set of detections forms.
 *
 * Greedy single-pass clustering, seeded worst-first, so a patch is centred on its most
 * serious plant rather than on whichever one happened to be recorded first. Plants
 * without a location cannot be grouped — a hotspot is a place — and are left out; the UI
 * counts them separately rather than pretending they were included.
 */
export function clusterHotspots(detections: readonly ApiDetection[]): ApiHotspot[] {
  const located = [...detections].filter(hasLocation).sort(worstFirst);

  const groups: Array<{ issue: string; members: Located[]; centre: LatLon }> = [];

  for (const detection of located) {
    const home = groups.find(
      (group) =>
        group.issue === detection.issue.code &&
        distanceM(group.centre, detection.location) <= HOTSPOT_RADIUS_M,
    );

    if (home) {
      home.members.push(detection);
      home.centre = meanPoint(home.members.map((member) => member.location));
    } else {
      groups.push({
        issue: detection.issue.code,
        members: [detection],
        centre: detection.location,
      });
    }
  }

  return groups.map(toHotspot).sort(hotspotOrder);
}

function toHotspot(group: { members: Located[]; centre: LatLon }): ApiHotspot {
  const members = [...group.members].sort(worstFirst);
  const worst = members[0]!;
  const rows = [
    ...new Set(members.map((member) => member.row).filter((row): row is number => row != null)),
  ].sort((a, b) => a - b);

  return {
    // Stable across renders and readable in a URL or a log line: a hotspot is an issue at
    // a place, and both halves come from the data rather than from a counter.
    id: `${worst.issue.code}@${group.centre.lat.toFixed(5)},${group.centre.lon.toFixed(5)}`,
    severity: worst.severity,
    centre: { lat: round(group.centre.lat), lon: round(group.centre.lon) },
    rows,
    detection_count: members.length,
    issue: worst.issue,
    // The sample is what the operator looks at before walking out, so a plant whose
    // photograph actually arrived beats a more severe one with nothing to show.
    sample_detection_id: (members.find((m) => m.crop_url ?? m.image_url) ?? worst).id,
  };
}

/** Worst severity first, then the more confident call, then the more recent. */
function worstFirst(a: ApiDetection, b: ApiDetection): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    b.confidence - a.confidence ||
    Date.parse(b.detected_at) - Date.parse(a.detected_at)
  );
}

/** Worst first, then biggest: the order someone should deal with them in. */
function hotspotOrder(a: ApiHotspot, b: ApiHotspot): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    b.detection_count - a.detection_count ||
    a.id.localeCompare(b.id)
  );
}

function meanPoint(points: readonly LatLon[]): LatLon {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  };
}

/** Seven decimal places is about a centimetre — finer than the RTK fix, and stable. */
function round(value: number): number {
  return Number(value.toFixed(7));
}

/** The span of rows a hotspot covers, as an operator would say it: "rows 6 to 9". */
export function rowRangeLabel(rows: readonly number[]): string | null {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (first === last) return `Row ${first}`;
  // Contiguous rows are a range; scattered ones are listed, because "rows 2 to 9" would
  // send someone down seven rows when only three of them have anything in them.
  const contiguous = rows.every((row, index) => row === first + index);
  return contiguous ? `Rows ${first} to ${last}` : `Rows ${rows.join(', ')}`;
}
