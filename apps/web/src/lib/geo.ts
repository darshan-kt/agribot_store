/**
 * Field geometry in metres.
 *
 * Every map surface in the product needs the same thing: turn WGS84 degrees into a flat
 * frame it can draw in. Over a field of this size (B-4 is roughly 16 m by 100 m) the
 * curvature of the earth is irrelevant, so an equirectangular projection about the
 * field's own centre is exact to well under the RTK accuracy the robot reports. Anything
 * heavier would be precision the data does not have.
 *
 * The frame is east/north in metres, not screen coordinates. Which axis points where on
 * screen is a drawing decision and belongs to the component that draws — a 16 × 100 m
 * field is unreadable rendered north-up in a landscape panel, and only the component
 * knows the shape of the box it has to fill.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Metres east and north of a frame's origin. */
export interface Offset {
  east: number;
  north: number;
}

/** Near enough anywhere: the meridian varies by about 1 part in 1000 pole to equator. */
const METRES_PER_DEGREE_LAT = 111_320;

function metresPerDegreeLon(atLat: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180);
}

export interface LocalFrame {
  /** South-west corner of the bounding box, after padding. */
  origin: LatLon;
  /** East-west extent in metres. Never zero, so callers can divide by it. */
  widthM: number;
  /** North-south extent in metres. Never zero. */
  heightM: number;
  offsetOf(point: LatLon): Offset;
  /** The inverse of `offsetOf`: the coordinate a metre offset in this frame refers to.
   *  A tap on a map is a position in the panel, and it has to come back as a place. */
  pointAt(offset: Offset): LatLon;
}

/**
 * The smallest east/north frame containing every point, optionally padded.
 *
 * Padding is in metres rather than a percentage because it exists to keep a marker's
 * radius inside the panel, and a marker is a fixed size regardless of how big the field
 * is.
 */
export function localFrameOf(points: readonly LatLon[], paddingM = 0): LocalFrame {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);

  // A frame over nothing still has to be drawable; a degenerate one divides by zero in
  // every caller. One metre square at the null island is obviously wrong on screen,
  // which is the right outcome for geometry that never arrived.
  const minLat = lats.length ? Math.min(...lats) : 0;
  const maxLat = lats.length ? Math.max(...lats) : 0;
  const minLon = lons.length ? Math.min(...lons) : 0;
  const maxLon = lons.length ? Math.max(...lons) : 0;

  const mPerLon = metresPerDegreeLon((minLat + maxLat) / 2) || METRES_PER_DEGREE_LAT;

  const padLat = paddingM / METRES_PER_DEGREE_LAT;
  const padLon = paddingM / mPerLon;
  const origin: LatLon = { lat: minLat - padLat, lon: minLon - padLon };

  return {
    origin,
    widthM: Math.max((maxLon - minLon) * mPerLon + 2 * paddingM, 1),
    heightM: Math.max((maxLat - minLat) * METRES_PER_DEGREE_LAT + 2 * paddingM, 1),
    offsetOf(point) {
      return {
        east: (point.lon - origin.lon) * mPerLon,
        north: (point.lat - origin.lat) * METRES_PER_DEGREE_LAT,
      };
    },
    pointAt(offset) {
      return {
        lon: origin.lon + offset.east / mPerLon,
        lat: origin.lat + offset.north / METRES_PER_DEGREE_LAT,
      };
    },
  };
}

/** GeoJSON orders coordinates lon-first. Reading them by index at call sites invites
 *  exactly one bug, and it is always the same one. */
export function pointOf(coordinate: readonly number[]): LatLon {
  return { lon: coordinate[0] ?? 0, lat: coordinate[1] ?? 0 };
}

export function pointsOf(coordinates: readonly (readonly number[])[]): LatLon[] {
  return coordinates.map(pointOf);
}

/** Every vertex of a GeoJSON Polygon, rings flattened — enough to bound it. */
export function polygonPoints(polygon: { coordinates: number[][][] }): LatLon[] {
  return polygon.coordinates.flat().map(pointOf);
}

/** Straight-line distance in metres. Used for path lengths, not for navigation. */
export function distanceM(a: LatLon, b: LatLon): number {
  const mPerLon = metresPerDegreeLon((a.lat + b.lat) / 2);
  const east = (b.lon - a.lon) * mPerLon;
  const north = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.hypot(east, north);
}

/**
 * Compass bearing from `a` to `b`: 0° is north, increasing clockwise.
 *
 * Over a field this size the flat frame is exact enough that the spherical formula would
 * be answering a question the RTK fix cannot ask. Matches the contract's `heading_deg`,
 * which is a compass heading in [0, 360).
 */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const mPerLon = metresPerDegreeLon((a.lat + b.lat) / 2);
  const east = (b.lon - a.lon) * mPerLon;
  const north = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  if (east === 0 && north === 0) return 0;
  return (Math.atan2(east, north) * (180 / Math.PI) + 360) % 360;
}

/** Interpolate between two coordinates. Used to inset a boundary and to place a point
 *  along a row; both are straight-line questions at this scale. */
export function lerpPoint(a: LatLon, b: LatLon, t: number): LatLon {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}
