#!/usr/bin/env python3
"""
Draw a site's listening points over its obstacles.

    npm run render:sites            # every variant, into build/layouts/
    npm run render:sites -- chatham # just one

Why this exists. The layout screenshots in review threads were made by
throwaway scripts, so nobody could regenerate one or check what it claimed.
Worse, they were drawn north-up with no compass on them, while Chatham's own
campus map is printed upside down relative to north -- Fifth Avenue is 300 m
NORTH of the campus centroid and the printed sheet puts it at the bottom.
Comparing the two cost a round of confusion that a north arrow would have
prevented. So every figure here carries an arrow, a scale bar and its streets
named in place. See rl-wc3.4.

Reads src/data/placements.generated.json, which scripts/dump-placements.ts
writes from the real placement code. Rendering never recomputes a position;
if a figure disagrees with the app, the figure is wrong.
"""

import json
import math
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Polygon as MplPolygon

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = ROOT / "build" / "layouts"

# The enter radius from useGeofence: how close a walker must be to hear a park.
LISTENING_RADIUS_M = 15

SITES = {
    "terrace": {
        "title": "Terrace Park, Sioux Falls",
        "nogo": "terraceNoGoPolygons.json",
        "boundary": None,
        "start": None,
    },
    "chatham": {
        "title": "Chatham University, Shadyside campus",
        "nogo": "chathamNoGoPolygons.json",
        "boundary": "chathamCampus.json",
        # 5798 Woodland Road, the Susan Bergman Gurrentz '56 Art Gallery, where
        # the walk begins. Nominatim resolves the house number only as far as
        # the street, so this is the street-level match and wants a real pin
        # dropped on it during the site visit (rl-wc3.3).
        "start": (-79.9242351, 40.4490452, "Start: Gurrentz Gallery (approx.)"),
    },
    "dsu": {
        "title": "Dakota State University, Madison",
        "nogo": None,
        "boundary": None,
        "start": None,
    },
}

# Drawn where the street runs, not in a legend. Positions are a point on the
# street itself and the label is placed there with a rotation.
STREET_LABELS = {
    "chatham": [
        (-79.92700, 40.45050, "Fifth Avenue", 28),
        (-79.92620, 40.44780, "Murray Hill Avenue", 80),
        (-79.92450, 40.44420, "Wilkins Avenue", 0),
        (-79.92430, 40.44900, "Woodland Road", 65),
        (-79.92330, 40.45010, "N Woodland Road", 60),
    ],
    "terrace": [
        (-96.74180, 43.55650, "N Grange Ave", 90),
        (-96.74600, 43.55600, "N Lake Ave", 90),
    ],
}

INK = "#18201c"
MUTED = "#64756a"
SAGE = "#587a5e"
SAGE_FILL = "#c9d8c6"
WATER = "#7fa9c6"
BUILDING = "#b6ada2"
ROAD = "#9aa39b"
PAPER = "#f2efe6"
ALERT = "#a63a20"

# The two files name their kinds differently: Terrace was written by hand and
# says "lake", "pool", "street"; Chatham comes from the Overpass script and
# says "water", "swimming_pool", "road". Both are listed rather than renamed,
# because renaming a shipped data file to please a renderer is the wrong way
# round.
KIND_STYLE = {
    "building": (BUILDING, 0.95),
    "parking": ("#c8c2b6", 0.9),
    "water": (WATER, 0.85),
    "lake": (WATER, 0.85),
    "pool": (WATER, 0.85),
    "swimming_pool": (WATER, 0.85),
    "road": (ROAD, 0.55),
    "street": (ROAD, 0.55),
    "pitch": ("#a8c0a0", 0.7),
    "playground": ("#a8c0a0", 0.7),
}


def rings(feature):
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    return [polygon[0] for polygon in geometry["coordinates"]]


def render(variant: str) -> pathlib.Path:
    spec = SITES[variant]
    placements = json.loads((DATA / "placements.generated.json").read_text())[variant]
    points = [(p["name"], p["coords"][0], p["coords"][1]) for p in placements["points"]]

    lats = [lat for _, _, lat in points]
    lons = [lon for _, lon, _ in points]
    mid_lat = sum(lats) / len(lats)
    # Equirectangular: one degree of longitude is shorter than one of latitude,
    # and a map drawn without this correction leans.
    aspect = 1 / math.cos(math.radians(mid_lat))

    figure, axes = plt.subplots(figsize=(9, 11), dpi=150)
    figure.patch.set_facecolor(PAPER)
    axes.set_facecolor(PAPER)

    boundary_ring = None
    if spec["boundary"]:
        boundary_ring = json.loads((DATA / spec["boundary"]).read_text())["geometry"]["coordinates"][0]
        axes.add_patch(MplPolygon(boundary_ring, closed=True, facecolor=SAGE_FILL,
                                  edgecolor=SAGE, linewidth=1.4, alpha=0.45, zorder=1))

    if spec["nogo"]:
        for feature in json.loads((DATA / spec["nogo"]).read_text())["features"]:
            colour, alpha = KIND_STYLE.get(feature["properties"].get("kind"), (ROAD, 0.5))
            for ring in rings(feature):
                axes.add_patch(MplPolygon(ring, closed=True, facecolor=colour,
                                          edgecolor="none", alpha=alpha, zorder=2))

    # A degree of longitude is shorter than one of latitude, so a listening
    # area is an ellipse in degrees and only comes out round once the axes
    # aspect above is applied.
    radius_lat = LISTENING_RADIUS_M / 111_320
    radius_lon = LISTENING_RADIUS_M / (111_320 * math.cos(math.radians(mid_lat)))
    for name, lon, lat in points:
        axes.add_patch(Ellipse((lon, lat), 2 * radius_lon, 2 * radius_lat,
                               facecolor=SAGE, edgecolor=SAGE, alpha=0.18,
                               linewidth=0.8, zorder=3))
        axes.plot(lon, lat, "o", markersize=3.5, color=INK, zorder=5)
        axes.annotate(name.replace(" State Park", "").replace(" Historic", ""),
                      (lon, lat), textcoords="offset points", xytext=(6, 4),
                      fontsize=6.5, color=INK, zorder=6)

    if spec["start"]:
        slon, slat, label = spec["start"]
        axes.plot(slon, slat, marker="*", markersize=18, color=ALERT,
                  markeredgecolor=PAPER, markeredgewidth=0.8, zorder=7)
        axes.annotate(label, (slon, slat), textcoords="offset points", xytext=(10, -12),
                      fontsize=7.5, color=ALERT, weight="bold", zorder=7)

    for lon, lat, label, rotation in STREET_LABELS.get(variant, []):
        axes.text(lon, lat, label.upper(), fontsize=7, color=MUTED, rotation=rotation,
                  rotation_mode="anchor", ha="center", va="center", zorder=8,
                  bbox=dict(boxstyle="round,pad=0.25", facecolor=PAPER,
                            edgecolor="none", alpha=0.75))

    # Frame on the drawn content, with room for the furniture.
    xs = lons + ([p[0] for p in boundary_ring] if boundary_ring else [])
    ys = lats + ([p[1] for p in boundary_ring] if boundary_ring else [])
    pad_x = (max(xs) - min(xs)) * 0.10 or 0.001
    pad_y = (max(ys) - min(ys)) * 0.10 or 0.001
    axes.set_xlim(min(xs) - pad_x, max(xs) + pad_x)
    axes.set_ylim(min(ys) - pad_y, max(ys) + pad_y)
    axes.set_aspect(aspect)
    axes.axis("off")

    # North arrow, top right, in axes fractions so it never lands on the site.
    axes.annotate("", xy=(0.955, 0.965), xytext=(0.955, 0.895),
                  xycoords="axes fraction",
                  arrowprops=dict(arrowstyle="-|>", color=INK, linewidth=1.6))
    axes.text(0.955, 0.975, "N", transform=axes.transAxes, ha="center",
              fontsize=11, weight="bold", color=INK)

    # Scale bar: a round number of metres, converted back into degrees.
    span_m = (axes.get_xlim()[1] - axes.get_xlim()[0]) * 111_320 * math.cos(math.radians(mid_lat))
    bar_m = next(step for step in (25, 50, 100, 200, 500, 1000) if step > span_m / 6)
    bar_deg = bar_m / (111_320 * math.cos(math.radians(mid_lat)))
    x0 = axes.get_xlim()[0] + pad_x * 0.4
    y0 = axes.get_ylim()[0] + pad_y * 0.5
    axes.plot([x0, x0 + bar_deg], [y0, y0], color=INK, linewidth=2.4, zorder=9)
    axes.text(x0 + bar_deg / 2, y0 + pad_y * 0.12, f"{bar_m} m", ha="center",
              fontsize=8, color=INK, zorder=9)

    closest = min(
        math.hypot((a[1] - b[1]) * 111_320 * math.cos(math.radians(mid_lat)),
                   (a[2] - b[2]) * 111_320)
        for i, a in enumerate(points) for b in points[i + 1:]
    )
    axes.set_title(f"{spec['title']}\n"
                   f"{len(points)} listening points, {LISTENING_RADIUS_M} m radius "
                   f"— closest pair {closest:.1f} m",
                   fontsize=11, color=INK, loc="left", pad=14)

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{variant}.png"
    figure.savefig(path, facecolor=PAPER, bbox_inches="tight")
    plt.close(figure)
    return path


def main() -> None:
    wanted = sys.argv[1:] or list(SITES)
    for variant in wanted:
        if variant not in SITES:
            raise SystemExit(f"unknown variant {variant!r}; try {', '.join(SITES)}")
        print(f"wrote {render(variant).relative_to(ROOT)}")


if __name__ == "__main__":
    main()
