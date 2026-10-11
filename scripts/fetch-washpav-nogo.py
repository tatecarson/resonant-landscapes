#!/usr/bin/env python3
"""
Build the downtown Sioux Falls no-go polygons from OpenStreetMap.

    python3 scripts/fetch-washpav-nogo.py

Writes src/data/washpavNoGoPolygons.json, the same shape as the Chatham file.

The walk starts in the gallery at the Washington Pavilion: a QR code on the
wall label opens /washpav and the walker goes out into downtown. The site is
the blocks Tate marked on 2026-10-11, W 9th St to W 13th St and South Dakota
Ave to S 1st Ave, taken as the rectangle between those four street
centrelines. Crossing streets is fine downtown, so roads are no-go only for a
point to stand in, never for a walker to cross.

Unlike Chatham there is no site polygon in OSM to check against, so the
rectangle is the site. The query, buffering and relation assembly are
Chatham's and are imported from fetch-chatham-nogo.py rather than copied, so
a fix to one is a fix to both.

Two things downtown needs that Chatham did not, both from Tate's look at the
first layout on 2026-10-11:

Parking lots. Many downtown lots are mapped only as their aisles, with no
lot outline, and a point landed between two aisles in what was plainly a
lot. Aisles are buffered PARKING_AISLE_HALF_WIDTH_M either side, enough to
take in a row of stalls on each side.

Business entrances. A spot should not put a stranger standing at someone's
front door. Doors are almost never mapped here (three entrance nodes in all
of downtown), so the frontage stands in for them: every building with a
business in it or on it gets a BUSINESS_HALO_M strip around its walls, and a
business node outside any mapped building gets a square of the same size.
The cost is that a spot cannot stand on a business's stretch of sidewalk at
all, door or blank wall.
"""

import importlib.util
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("chatham_nogo", HERE / "fetch-chatham-nogo.py")
chatham = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(chatham)

# (south, west, north, east): the centrelines of W 13th St, South Dakota Ave,
# W 9th St and S 1st Ave, read off OSM ways on 2026-10-11. Must match
# WASHPAV_BOUNDS in src/utils/scaledParks.ts.
SITE = (43.54245, -96.72990, 43.54731, -96.72530)

# Wide enough to take in the far side of each boundary street, so the road
# buffer and the buildings facing the site across it are both present.
MARGIN_DEG = 0.0003
BBOX = (SITE[0] - MARGIN_DEG, SITE[1] - MARGIN_DEG, SITE[2] + MARGIN_DEG, SITE[3] + MARGIN_DEG)

# An aisle is about 7 m wide with 5.5 m stalls either side, so 8 m from its
# centreline reaches the back of the stalls. Chatham's 5 m for every service
# road left the stall rows open.
PARKING_AISLE_HALF_WIDTH_M = 8.0

# Most of a downtown sidewalk's width. With the road buffer on the other
# side, nothing is left in front of a business to stand on, which is the
# point.
BUSINESS_HALO_M = 4.0

# What counts as a business: somewhere with a front door a stranger would be
# standing at. Street furniture and SculptureWalk's sculptures are tagged
# with the same keys and are not that.
BUSINESS_KEYS = ("shop", "amenity", "office", "craft", "tourism", "healthcare")
NOT_BUSINESS = {
    "amenity": {
        "bench", "waste_basket", "bicycle_parking", "parking", "parking_entrance",
        "parking_space", "fountain", "post_box", "vending_machine", "drinking_water",
        "toilets", "charging_station", "motorcycle_parking", "shelter", "clock",
        "recycling", "telephone", "bicycle_rental", "atm", "loading_dock",
    },
    "tourism": {"artwork", "information", "viewpoint", "picnic_site"},
}

BUSINESS_NODE_QUERY = """[out:json][timeout:90];
(
  node["shop"]({bbox});
  node["amenity"]({bbox});
  node["office"]({bbox});
  node["craft"]({bbox});
  node["tourism"]({bbox});
  node["healthcare"]({bbox});
  node["entrance"]({bbox});
);
out;"""


def site_ring() -> list[list[float]]:
    south, west, north, east = SITE
    return [[west, south], [east, south], [east, north], [west, north], [west, south]]


def is_business(tags: dict) -> bool:
    if "entrance" in tags:
        return True
    for key in BUSINESS_KEYS:
        value = tags.get(key)
        if value and value not in NOT_BUSINESS.get(key, set()):
            return True
    return False


def ring_as_geometry(ring: list[list[float]]) -> list[dict]:
    return [{"lon": lon, "lat": lat} for lon, lat in ring]


def square_around(lat: float, lon: float, half_m: float) -> list[list[float]]:
    dlat = half_m / 111_320.0
    dlon = half_m / (111_320.0 * math.cos(math.radians(lat)))
    return [
        [lon - dlon, lat - dlat],
        [lon + dlon, lat - dlat],
        [lon + dlon, lat + dlat],
        [lon - dlon, lat + dlat],
        [lon - dlon, lat - dlat],
    ]


def main() -> None:
    south, west, north, east = BBOX
    bbox = f"{south},{west},{north},{east}"
    query = chatham.QUERY.format(bbox=bbox, roads="|".join(chatham.ROAD_HALF_WIDTH))
    site = site_ring()

    print(f"querying Overpass for {bbox}")
    elements = chatham.fetch(query).get("elements", [])
    print(f"  {len(elements)} elements")
    print("querying Overpass for businesses and entrances")
    business_nodes = [
        node
        for node in chatham.fetch(BUSINESS_NODE_QUERY.format(bbox=bbox)).get("elements", [])
        if is_business(node.get("tags", {}))
    ]
    print(f"  {len(business_nodes)} business or entrance nodes")

    mid_latitude = (south + north) / 2
    features = []
    counts: dict[str, int] = {}
    skipped = 0
    unclosed_total = 0
    # Every building outline, so business nodes can be matched to the
    # building they are in.
    building_rings: list[tuple[list[list[float]], dict, int]] = []

    def add(kind: str, ring: list[list[float]], properties: dict) -> None:
        features.append(
            {
                "type": "Feature",
                "properties": {"kind": kind, **properties},
                "geometry": {"type": "Polygon", "coordinates": [chatham.round_ring(ring)]},
            }
        )

    for element in elements:
        tags = element.get("tags", {})
        kind = chatham.classify(tags)
        if kind is None:
            continue
        name = tags.get("name")
        osm_id = element["id"]

        if element.get("type") == "relation":
            if tags.get("type") not in chatham.AREA_RELATION_TYPES:
                continue
            rings, unclosed = chatham.assemble_outer_rings(element.get("members", []))
            unclosed_total += unclosed
            kept = [ring for ring in rings if chatham.touches_campus(ring, site)]
            if not kept:
                skipped += 1
                continue
            for index, ring in enumerate(kept):
                add(kind, ring, {
                    "name": name,
                    "osm_id": osm_id,
                    "osm_type": "relation",
                    **({"ring": index} if len(kept) > 1 else {}),
                })
                if kind == "building":
                    building_rings.append((ring, tags, osm_id))
            counts[kind] = counts.get(kind, 0) + 1
            continue

        geometry = element.get("geometry")
        if not geometry or len(geometry) < 2:
            continue

        if kind == "road":
            if tags.get("service") == "parking_aisle":
                half = PARKING_AISLE_HALF_WIDTH_M
            else:
                half = chatham.ROAD_HALF_WIDTH.get(tags["highway"], 6.0)
            rings = [
                r
                for r in chatham.buffer_line(geometry, half, mid_latitude)
                if chatham.touches_campus(r, site)
            ]
            if not rings:
                skipped += 1
                continue
            for index, ring in enumerate(rings):
                add("road", ring, {
                    "name": name,
                    "highway": tags["highway"],
                    **({"service": tags["service"]} if "service" in tags else {}),
                    "osm_id": osm_id,
                    "segment": index,
                })
            counts["road"] = counts.get("road", 0) + 1
            continue

        ring = [[node["lon"], node["lat"]] for node in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) < 4 or not chatham.touches_campus(ring, site):
            skipped += 1
            continue
        add(kind, ring, {"name": name, "osm_id": osm_id})
        if kind == "building":
            building_rings.append((ring, tags, osm_id))
        counts[kind] = counts.get(kind, 0) + 1

    # Business frontage: a strip around the walls of every building with a
    # business in it, and a square around business nodes in no building.
    fronted: dict[int, tuple[list[list[float]], str | None]] = {}
    for ring, tags, osm_id in building_rings:
        if is_business(tags):
            fronted[osm_id] = (ring, tags.get("name"))
    loose = 0
    for node in business_nodes:
        lat, lon = node["lat"], node["lon"]
        home = next(
            (osm_id for ring, _, osm_id in building_rings if chatham.point_in_ring(lon, lat, ring)),
            None,
        )
        if home is not None:
            ring, _ = next((r, t) for r, t, i in building_rings if i == home)
            fronted.setdefault(home, (ring, node.get("tags", {}).get("name")))
            continue
        square = square_around(lat, lon, BUSINESS_HALO_M)
        if not chatham.touches_campus(square, site):
            continue
        add("business", square, {"name": node.get("tags", {}).get("name"), "osm_id": node["id"], "osm_type": "node"})
        loose += 1

    for osm_id, (ring, name) in fronted.items():
        strips = [
            r
            for r in chatham.buffer_line(ring_as_geometry(ring), BUSINESS_HALO_M, mid_latitude)
            if chatham.touches_campus(r, site)
        ]
        for index, strip in enumerate(strips):
            add("business", strip, {"name": name, "osm_id": osm_id, "segment": index})
    counts["business frontage"] = len(fronted)
    counts["business node"] = loose

    out = HERE.parent / "src" / "data" / "washpavNoGoPolygons.json"
    out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n"
    )
    print(f"wrote {out.relative_to(HERE.parent)}: {len(features)} polygons")
    print(f"  ({skipped} dropped for not touching the site)")
    for kind, count in sorted(counts.items()):
        print(f"  {kind}: {count}")
    if unclosed_total:
        print(
            f"WARNING: {unclosed_total} outer ring(s) could not be closed and are not "
            f"in the file. Those footprints are not protected.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
