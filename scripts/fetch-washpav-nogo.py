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
rectangle is the site. Everything else, the query, the buffering, relation
assembly, is Chatham's and is imported from fetch-chatham-nogo.py rather
than copied, so a fix to one is a fix to both.
"""

import importlib.util
import json
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


def site_ring() -> list[list[float]]:
    south, west, north, east = SITE
    return [[west, south], [east, south], [east, north], [west, north], [west, south]]


def main() -> None:
    south, west, north, east = BBOX
    bbox = f"{south},{west},{north},{east}"
    query = chatham.QUERY.format(bbox=bbox, roads="|".join(chatham.ROAD_HALF_WIDTH))
    site = site_ring()

    print(f"querying Overpass for {bbox}")
    elements = chatham.fetch(query).get("elements", [])
    print(f"  {len(elements)} elements")

    mid_latitude = (south + north) / 2
    features = []
    counts: dict[str, int] = {}
    skipped = 0
    unclosed_total = 0

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
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "name": name,
                            "kind": kind,
                            "osm_id": osm_id,
                            "osm_type": "relation",
                            **({"ring": index} if len(kept) > 1 else {}),
                        },
                        "geometry": {"type": "Polygon", "coordinates": [chatham.round_ring(ring)]},
                    }
                )
            counts[kind] = counts.get(kind, 0) + 1
            continue

        geometry = element.get("geometry")
        if not geometry or len(geometry) < 2:
            continue

        if kind == "road":
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
                        "geometry": {"type": "Polygon", "coordinates": [chatham.round_ring(ring)]},
                    }
                )
            counts["road"] = counts.get("road", 0) + 1
            continue

        ring = [[node["lon"], node["lat"]] for node in geometry]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) < 4 or not chatham.touches_campus(ring, site):
            skipped += 1
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "kind": kind, "osm_id": osm_id},
                "geometry": {"type": "Polygon", "coordinates": [chatham.round_ring(ring)]},
            }
        )
        counts[kind] = counts.get(kind, 0) + 1

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
