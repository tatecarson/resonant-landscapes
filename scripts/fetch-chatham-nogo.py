#!/usr/bin/env python3
"""
Build the Chatham no-go polygons from OpenStreetMap.

The Terrace Park set was committed as data with osm_ids and no way to
regenerate it, so nobody can tell what was asked for or refresh it when the
site changes. This is the query, written down.

    python3 scripts/fetch-chatham-nogo.py

Writes src/data/chathamNoGoPolygons.json in the same shape as the Terrace
file: a FeatureCollection of Polygons, each with name, kind and osm_id.

Why roads are in here, and buffered. scaledParks snaps a pin out of a no-go
polygon by walking an expanding square spiral until it clears, so a pin is
only ever pushed somewhere that is NOT in this set. Leave the roads out and
the spiral will push a point off a building and into Woodland Road. And OSM
highways are ways, not areas, so a centreline would only be avoided by a pin
sitting exactly on it: they are buffered to a carriageway width instead.

Accessible here means not dangerous to walk to, which is the bar Tate set for
this site. It does not mean wheelchair accessible; the campus is on a hill.
"""

import json
import math
import pathlib
import sys
import time
import subprocess

# The campus, typed out by hand from the bounds of OSM way 172206707
# ("Chatham University"): the way's own edges, nothing added. The ~30 m that
# keeps a road or lot along the boundary from being clipped is MARGIN_DEG,
# which the query below sweeps around this box.
#
# Tight on purpose. A wider box swept in most of residential Shadyside: 460
# building footprints for a campus with a few dozen, and a file that shipped
# in the bundle. Nothing outside this margin can ever be reached, because
# points are placed inside the campus bounds and the snap moves in 9 m steps.
#
# Hand-typed next to a living OSM object, so main() re-measures the way and
# stops if the two ever disagree:
CAMPUS_WAY = 172206707
CAMPUS = (40.4440242, -79.9277955, 40.4510886, -79.9222085)

# How far the fetched way's bounds may sit from CAMPUS before main() aborts.
# About 5 m: coordinates here carry 7 decimals, one mistyped digit moves a
# bound by 1e-4, and the sweep margin is 3e-4. Way boundary edits show up in
# whole metres, so anything past this is a real change or a real typo, and
# either way the query, the no-go filter and the shipped campus polygon would
# all inherit the disagreement.
CAMPUS_TOLERANCE_DEG = 0.00005
MARGIN_DEG = 0.0003  # ~33 m north-south, ~25 m east-west at this latitude
BBOX = (
    CAMPUS[0] - MARGIN_DEG,
    CAMPUS[1] - MARGIN_DEG,
    CAMPUS[2] + MARGIN_DEG,
    CAMPUS[3] + MARGIN_DEG,
)

# About 11 cm. The walk decides things at 15 m, so more than this is noise
# that ships to a phone on cellular for nothing.
COORD_DP = 6

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Half-widths in metres, applied either side of a road centreline. Generous on
# purpose: the cost of an over-wide road is a pin nudged a few metres onto
# grass, and the cost of an under-wide one is a walker standing in traffic.
ROAD_HALF_WIDTH = {
    "motorway": 12.0,
    "trunk": 12.0,
    "primary": 10.0,
    "secondary": 9.0,
    "tertiary": 8.0,
    "residential": 7.0,
    "unclassified": 7.0,
    "service": 5.0,
}

QUERY = """[out:json][timeout:90];
(
  way["building"]({bbox});
  way["amenity"="parking"]({bbox});
  way["natural"="water"]({bbox});
  way["leisure"~"pitch|playground|swimming_pool"]({bbox});
  way["highway"~"{roads}"]({bbox});
);
out geom;"""


def fetch(query: str) -> dict:
    """
    Overpass rate-limits hard, so back off and alternate mirrors.

    Through curl rather than urllib: Python here has no root certificates and
    every https call fails verification, while curl uses the system store.
    One less thing for whoever runs this next to debug.
    """
    last = None
    for attempt in range(6):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            result = subprocess.run(
                [
                    "curl", "-s", "--fail", "--max-time", "120",
                    "-A", "resonant-landscapes/nogo-builder",
                    url, "--data-urlencode", f"data={query}",
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            payload = json.loads(result.stdout)
            if payload.get("remark"):
                raise RuntimeError(f"overpass remark: {payload['remark']}")
            return payload
        except Exception as error:  # noqa: BLE001 - report and retry
            last = error
            wait = 15 * (attempt + 1)
            print(f"  attempt {attempt + 1} failed ({error}); waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f"could not reach Overpass: {last}")


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    """Ray casting. Small enough to write, and this is the only place it runs."""
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y):
            crossing = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if crossing > x:
                inside = not inside
    return inside


def segments_cross(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])

    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def touches_campus(ring: list[list[float]], campus: list[list[float]]) -> bool:
    """
    Whether a polygon can ever matter.

    Points are constrained to the campus polygon, so anything that does not
    overlap it is unreachable and only costs bytes on a phone. Without this
    the set carried 363 buildings, most of them Shadyside houses across the
    road from a campus a walker never leaves.

    Three ways to overlap, and a road crossing a corner needs the third: it
    can have both ends outside the campus and still run through it.
    """
    if any(point_in_ring(x, y, campus) for x, y in ring):
        return True
    if any(point_in_ring(x, y, ring) for x, y in campus):
        return True
    for edge in zip(ring, ring[1:]):
        for campus_edge in zip(campus, campus[1:]):
            if segments_cross(edge[0], edge[1], campus_edge[0], campus_edge[1]):
                return True
    return False


def round_ring(ring: list[list[float]]) -> list[list[float]]:
    return [[round(lon, COORD_DP), round(lat, COORD_DP)] for lon, lat in ring]


def ring_bounds(ring: list[list[float]]) -> tuple[float, float, float, float]:
    """(south, west, north, east), the order CAMPUS is typed in."""
    lats = [point[1] for point in ring]
    lons = [point[0] for point in ring]
    return (min(lats), min(lons), max(lats), max(lons))


def classify(tags: dict) -> str | None:
    if "building" in tags:
        return "building"
    if tags.get("amenity") == "parking":
        return "parking"
    if tags.get("natural") == "water":
        return "water"
    if tags.get("leisure") in {"pitch", "playground", "swimming_pool"}:
        return tags["leisure"]
    if "highway" in tags:
        return "road"
    return None


def buffer_line(geometry: list[dict], half_width_m: float, latitude: float) -> list[list[float]]:
    """
    A rectangle per segment, unioned by simply listing them as one ring.

    Not a real geometric buffer: no library here does one, and a proper union
    is not needed. Each segment becomes its own quad and each quad is its own
    polygon, which is enough for a point-in-polygon test. Corners are left
    unmitred, so the join between two segments has a small notch; the
    half-widths above are wide enough that the notch never reaches walkable
    ground.
    """
    # Degrees per metre at this latitude.
    lat_per_m = 1.0 / 111_320.0
    lon_per_m = 1.0 / (111_320.0 * math.cos(math.radians(latitude)))

    quads: list[list[list[float]]] = []
    for start, end in zip(geometry, geometry[1:]):
        x1, y1 = start["lon"], start["lat"]
        x2, y2 = end["lon"], end["lat"]
        dx = (x2 - x1) / lon_per_m
        dy = (y2 - y1) / lat_per_m
        length = math.hypot(dx, dy)
        if length < 0.01:
            continue
        # Unit normal, in metres, then back to degrees.
        nx = -dy / length * half_width_m
        ny = dx / length * half_width_m
        ox, oy = nx * lon_per_m, ny * lat_per_m
        quads.append(
            [
                [x1 + ox, y1 + oy],
                [x2 + ox, y2 + oy],
                [x2 - ox, y2 - oy],
                [x1 - ox, y1 - oy],
                [x1 + ox, y1 + oy],
            ]
        )
    return quads


def main() -> None:
    south, west, north, east = BBOX
    bbox = f"{south},{west},{north},{east}"
    query = QUERY.format(bbox=bbox, roads="|".join(ROAD_HALF_WIDTH))

    print(f"querying Overpass for campus way {CAMPUS_WAY}")
    campus_payload = fetch(f"[out:json][timeout:60];way({CAMPUS_WAY});out geom;")
    campus_element = campus_payload["elements"][0]
    campus_ring = [[n["lon"], n["lat"]] for n in campus_element["geometry"]]
    if campus_ring[0] != campus_ring[-1]:
        campus_ring.append(campus_ring[0])
    print(f"  campus polygon: {len(campus_ring)} nodes")

    # CAMPUS was typed by hand from this way, and the query bbox, the
    # touches_campus filter and the campus polygon shipped in the bundle all
    # follow from it. Check the two agree before anything downstream
    # inherits the disagreement: a way that grew or moved, or a digit
    # mistyped years later, would otherwise clip or overshoot silently.
    fetched_bounds = ring_bounds(campus_ring)
    worst = max(
        abs(typed - fetched) for typed, fetched in zip(CAMPUS, fetched_bounds)
    )
    if worst > CAMPUS_TOLERANCE_DEG:
        lat_per_deg = 111_320.0
        lon_per_deg = lat_per_deg * math.cos(math.radians((CAMPUS[0] + CAMPUS[2]) / 2))
        raise SystemExit(
            f"campus way {CAMPUS_WAY} no longer matches CAMPUS.\n"
            f"  CAMPUS, typed by hand (south, west, north, east): {CAMPUS}\n"
            f"  the way as fetched today (south, west, north, east): {fetched_bounds}\n"
            f"The widest side is off by {worst:.7f} degrees, about "
            f"{worst * lat_per_deg:.1f} m north-south or "
            f"{worst * lon_per_deg:.1f} m east-west, past the "
            f"{CAMPUS_TOLERANCE_DEG:.5f} degree allowance.\n"
            f"If the boundary really moved, retype CAMPUS from the new "
            f"bounds and consider what the move does to points already "
            f"placed. Do not widen the tolerance to make this go away."
        )
    print(f"  campus bounds match CAMPUS (widest gap {worst:.7f} deg)")

    print(f"querying Overpass for {bbox}")
    payload = fetch(query)
    elements = payload.get("elements", [])
    print(f"  {len(elements)} elements")

    mid_latitude = (south + north) / 2
    features = []
    counts: dict[str, int] = {}
    skipped = 0

    for element in elements:
        tags = element.get("tags", {})
        kind = classify(tags)
        geometry = element.get("geometry")
        if kind is None or not geometry or len(geometry) < 2:
            continue

        name = tags.get("name")
        osm_id = element["id"]

        if kind == "road":
            half = ROAD_HALF_WIDTH.get(tags["highway"], 6.0)
            rings = [r for r in buffer_line(geometry, half, mid_latitude) if touches_campus(r, campus_ring)]
            if not rings:
                skipped += 1
                continue
            for index, ring in enumerate(rings):
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "name": name,
                            "kind": "road",
                            "highway": tags["highway"],
                            "osm_id": osm_id,
                            "segment": index,
                        },
                        "geometry": {"type": "Polygon", "coordinates": [round_ring(ring)]},
                    }
                )
            counts["road"] = counts.get("road", 0) + 1
            continue

        ring = [[node["lon"], node["lat"]] for node in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) < 4:
            continue
        if not touches_campus(ring, campus_ring):
            skipped += 1
            continue

        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "kind": kind, "osm_id": osm_id},
                "geometry": {"type": "Polygon", "coordinates": [round_ring(ring)]},
            }
        )
        counts[kind] = counts.get(kind, 0) + 1

    # The campus itself, as a positive constraint.
    #
    # Without it the walk placed 11 of its 13 points on residential Shadyside:
    # not in any building, road or car park, so every no-go assertion passed,
    # and on land that is not Chatham's. The bounds are a rectangle and the
    # campus is not, so "inside the bounds" was never the same question as
    # "on the campus".
    campus_out = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "chathamCampus.json"
    campus_out.write_text(
        json.dumps(
            {
                "type": "Feature",
                "properties": {
                    "name": campus_element.get("tags", {}).get("name", "Chatham University"),
                    "osm_id": CAMPUS_WAY,
                },
                "geometry": {"type": "Polygon", "coordinates": [round_ring(campus_ring)]},
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    print(f"wrote {campus_out.name}: {len(campus_ring)} nodes")

    out = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "chathamNoGoPolygons.json"
    # Compact, not pretty. This file is imported by the app and ships to a
    # phone; indentation was a third of its weight.
    out.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": features}, separators=(",", ":")
        )
        + "\n"
    )

    print(f"wrote {out.relative_to(out.parent.parent.parent)}: {len(features)} polygons")
    print(f"  ({skipped} dropped for not touching the campus)")
    for kind, count in sorted(counts.items()):
        print(f"  {kind}: {count}")


if __name__ == "__main__":
    main()
