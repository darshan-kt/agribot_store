"""Small geodesy helpers for building field geometry.

A local flat-earth approximation is correct to well under a centimetre over a field a few
hundred metres across, which is far tighter than RTK GPS itself. Anything larger than a
field should use a projection, not this.
"""

import math

from geoalchemy2 import WKTElement

SRID = 4326
_METRES_PER_DEG_LAT = 111_320.0


def metres_per_deg_lon(lat: float) -> float:
    return _METRES_PER_DEG_LAT * math.cos(math.radians(lat))


def offset(lat: float, lon: float, east_m: float, north_m: float) -> tuple[float, float]:
    """Move a point by a local east/north offset in metres."""
    return (
        lat + north_m / _METRES_PER_DEG_LAT,
        lon + east_m / metres_per_deg_lon(lat),
    )


def point(lat: float, lon: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=SRID)


def linestring(coords: list[tuple[float, float]]) -> WKTElement:
    body = ", ".join(f"{lon} {lat}" for lat, lon in coords)
    return WKTElement(f"LINESTRING({body})", srid=SRID)


def polygon(coords: list[tuple[float, float]]) -> WKTElement:
    """Coords as (lat, lon), open ring; the ring is closed here."""
    ring = [*coords, coords[0]]
    body = ", ".join(f"{lon} {lat}" for lat, lon in ring)
    return WKTElement(f"POLYGON(({body}))", srid=SRID)
