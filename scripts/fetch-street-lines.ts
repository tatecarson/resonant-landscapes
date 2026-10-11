/**
 * Build the street and sidewalk lines drawn over the painted grounds (rl-ffdd).
 *
 *     npx tsx scripts/fetch-street-lines.ts            # every walk
 *     npx tsx scripts/fetch-street-lines.ts washpav    # one walk
 *
 * Writes src/data/streetLines/<variant>.json: a FeatureCollection of
 * LineStrings, each with `kind` (street, service or path) and `osm_id`.
 *
 * Why a file and not a tile service. Painting the aerial imagery makes white
 * roofs and pale concrete the same cream, so the walker loses the sidewalks
 * exactly where they need them. The keyless vector tiles that would have
 * carried the streets drop OSM's sidewalks (the Pavilion's z14 tile has three
 * footways; OSM has fifty sidewalk ways there), and they would have been one
 * more host for production to depend on. A walk covers a few blocks, so the
 * lines are small enough to ship.
 *
 * The area is every listening spot of the walk plus MARGIN_M, so the lines
 * reach the screen's edge from anywhere on the walk. Run it again when the
 * spots move or OSM gains sidewalks; the run overwrites its output whole.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getScaledPoints } from "../src/utils/scaledParks";

type Variant = "dsu" | "terrace" | "chatham" | "washpav";
const VARIANTS: Variant[] = ["dsu", "terrace", "chatham", "washpav"];

/** Past the outermost spot: about half a screen's diagonal at the zoom floor. */
const MARGIN_M = 250;
const COORD_DP = 6;
const OUT_DIR = path.join(import.meta.dirname, "..", "src", "data", "streetLines");

const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const STREET = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "trunk"]);
const SERVICE = new Set(["service"]);
const PATH = new Set(["footway", "path", "pedestrian", "steps", "cycleway", "track"]);
/** Car park aisles and driveways crowd a lot with lines nobody walks along. */
const SKIPPED_SERVICE = new Set(["parking_aisle", "driveway", "drive-through"]);

type Kind = "street" | "service" | "path";

function kindOf(tags: Record<string, string>): Kind | null {
    const highway = tags.highway;
    if (STREET.has(highway)) return "street";
    if (SERVICE.has(highway)) return SKIPPED_SERVICE.has(tags.service ?? "") ? null : "service";
    if (PATH.has(highway)) return "path";
    return null;
}

function bboxFor(variant: Variant): [number, number, number, number] {
    const coords = getScaledPoints(variant).map((park: { scaledCoords: [number, number] }) => park.scaledCoords);
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const dLat = MARGIN_M / 111_320;
    const dLon = MARGIN_M / (111_320 * Math.cos((midLat * Math.PI) / 180));
    return [Math.min(...lats) - dLat, Math.min(...lons) - dLon, Math.max(...lats) + dLat, Math.max(...lons) + dLon];
}

interface OverpassWay {
    type: "way";
    id: number;
    tags?: Record<string, string>;
    geometry?: { lat: number; lon: number }[];
}

async function fetchWays(bbox: [number, number, number, number]): Promise<OverpassWay[]> {
    const query = `[out:json][timeout:90];way["highway"](${bbox.map((v) => v.toFixed(6)).join(",")});out geom;`;
    let last: unknown;
    // Overpass rate-limits hard, so back off and alternate mirrors.
    for (let attempt = 0; attempt < 6; attempt++) {
        const url = MIRRORS[attempt % MIRRORS.length];
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "User-Agent": "resonant-landscapes/street-lines" },
                body: new URLSearchParams({ data: query }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = (await response.json()) as { elements: OverpassWay[]; remark?: string };
            if (payload.remark) throw new Error(`overpass remark: ${payload.remark}`);
            return payload.elements.filter((element) => element.type === "way");
        } catch (error) {
            last = error;
            const wait = 15 * (attempt + 1);
            console.error(`  attempt ${attempt + 1} failed (${String(error)}); waiting ${wait}s`);
            await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        }
    }
    throw new Error(`could not reach Overpass: ${String(last)}`);
}

async function build(variant: Variant) {
    const bbox = bboxFor(variant);
    const ways = await fetchWays(bbox);
    const round = (value: number) => Number(value.toFixed(COORD_DP));
    const features = ways
        .map((way) => ({ way, kind: kindOf(way.tags ?? {}) }))
        .filter((entry): entry is { way: OverpassWay; kind: Kind } => entry.kind !== null && (entry.way.geometry?.length ?? 0) > 1)
        .sort((a, b) => a.way.id - b.way.id)
        .map(({ way, kind }) => ({
            type: "Feature" as const,
            properties: { kind, osm_id: way.id },
            geometry: {
                type: "LineString" as const,
                coordinates: way.geometry!.map(({ lat, lon }) => [round(lon), round(lat)]),
            },
        }));
    mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${variant}.json`);
    writeFileSync(file, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
    const counts = features.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.properties.kind]: (acc[f.properties.kind] ?? 0) + 1 }), {});
    console.log(`${variant}: ${features.length} lines ${JSON.stringify(counts)} -> ${path.relative(process.cwd(), file)}`);
}

const requested = process.argv.slice(2) as Variant[];
for (const variant of requested.length ? requested : VARIANTS) {
    await build(variant);
}
