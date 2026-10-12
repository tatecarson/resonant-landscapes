import { useSyncExternalStore } from "react";
import { createXYZ } from "ol/tilegrid";
import type TileGrid from "ol/tilegrid/TileGrid";
import { isDebugEnabled } from "./debug";
import { SATELLITE, basemapFor, requestedMap } from "../map/basemap";
import { isPaintedToneName, isTuningRequested, queryParam, type PaintStyle } from "./paintTuning";
import { detectVariant, type Variant } from "../utils/variant";

export { parsePaintedTone } from "./paintTuning";

/**
 * Candidate basemaps for a more painted ground (rl-ffdd), chosen per page load
 * with `?basemap=` (and `?tone=` for the painted one) so they can be judged by
 * eye, on foot, at the zoom the walk is actually read at.
 *
 * Stamen Watercolor is the look, but Stadia stops serving it at zoom 16 and the
 * walk rests at about 18.5, so asking for it there returns holes. The two
 * prototypes are the two ways round that:
 *
 * - `watercolor` caps the source at 16 and lets OpenLayers enlarge those tiles
 *   (about 5.6x at resting zoom). The detail goes; the washes stay.
 * - `collage` starts from the same imagery and cuts it into overlapping,
 *   slightly turned fragments with their tones flattened into planes, after
 *   Hockney's photo joiners and the cubists (PaintedBasemap.ts).
 * - `painted` starts from imagery that is sharp to zoom 20 and paints it in the
 *   browser with a Kuwahara pass (PaintedBasemap.ts), so detail never runs out.
 *
 * Each walk opens on its own style when the URL names none
 * (DEFAULT_MODE_BY_VARIANT): the Pavilion walk is painted, and the walks
 * that were already out in the world keep Outdoors, as they shipped.
 *
 * The parameters work without `?debug`, so a bookmark or a QR code can carry a
 * style. They change only what the ground looks like; the position spoof and
 * the other debug surfaces stay behind `?debug`.
 *
 * Where the tiles come from depends on the build, not the style: Stadia
 * authorizes one domain, so deploy previews (VITE_MAP_TILES, see
 * src/map/basemap.ts) cannot use it. There `outdoors` is the preview map that
 * module picks (aerial, or streets with `?map=streets`), `painted` paints
 * Esri's imagery instead of Stadia's, and `watercolor`, which only Stadia
 * serves, falls back to the preview map.
 */
export const BASEMAP_MODES = ["outdoors", "watercolor", "painted", "collage"] as const;
export type BasemapMode = (typeof BASEMAP_MODES)[number];

export interface BasemapSpec {
    url: string;
    /** Constant objects only: rlayers rebuilds the source when this changes identity. */
    tileGrid?: TileGrid;
    /** Needed when the pixels are read back, which a painted pass has to do. */
    crossOrigin?: string;
    attributions: string;
    /** The layer's own ceiling: OpenStreetMap's tiles stop at 19. */
    maxZoom: number;
    painted: boolean;
    /** Which pass paints it, for the painted styles. */
    paintStyle?: PaintStyle;
}

/*
 * Credits as docs.stadiamaps.com/attribution asks for them. Watercolor is the
 * one style that leaves out OpenMapTiles and adds Stamen; satellite adds the
 * imagery providers, which need no link.
 */
const STADIA_CREDIT = '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank">Stadia Maps</a>';
const OPENMAPTILES_CREDIT = '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>';
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const STAMEN_CREDIT = '&copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a>';
const IMAGERY_CREDIT = "&copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver (Contains Copernicus Data)";

/** The zoom Stadia stops serving Watercolor at; past it the tileset has holes. */
export const WATERCOLOR_MAX_ZOOM = 16;
const WATERCOLOR_GRID = createXYZ({ maxZoom: WATERCOLOR_MAX_ZOOM });

export const BASEMAP_SPECS: Record<BasemapMode, BasemapSpec> = {
    outdoors: {
        url: "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png",
        attributions: [STADIA_CREDIT, OPENMAPTILES_CREDIT, OSM_CREDIT].join(" "),
        maxZoom: 20,
        painted: false,
    },
    watercolor: {
        url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
        tileGrid: WATERCOLOR_GRID,
        attributions: [STADIA_CREDIT, STAMEN_CREDIT, OSM_CREDIT].join(" "),
        maxZoom: 20,
        painted: false,
    },
    painted: {
        url: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
        // Only here. Tiles already cached by the service worker from a
        // no-cors request come back opaque, and an opaque response to a CORS
        // image request fails, so switching the shipped layer to CORS would
        // blank a returning walker's cached ground.
        crossOrigin: "anonymous",
        attributions: [IMAGERY_CREDIT, STADIA_CREDIT, OPENMAPTILES_CREDIT, OSM_CREDIT].join(" "),
        maxZoom: 20,
        painted: true,
        paintStyle: "brush",
    },
    collage: {
        url: "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg",
        crossOrigin: "anonymous",
        attributions: [IMAGERY_CREDIT, STADIA_CREDIT, OPENMAPTILES_CREDIT, OSM_CREDIT].join(" "),
        maxZoom: 20,
        painted: true,
        paintStyle: "collage",
    },
};

/**
 * The spec a build actually uses for a style. `tiles` is VITE_MAP_TILES:
 * unset is production, where every style comes from Stadia. `requested` is
 * the page's `?map=`, which only a preview listens to.
 */
export function basemapSpecFor(
    mode: BasemapMode,
    tiles: string | undefined = import.meta.env.VITE_MAP_TILES,
    requested: string | null = typeof window === "undefined" ? null : requestedMap(window.location),
): BasemapSpec {
    if (!tiles) {
        return BASEMAP_SPECS[mode];
    }
    if (BASEMAP_SPECS[mode].painted) {
        // Esri sends Access-Control-Allow-Origin: *, so its tiles can be
        // read back and painted the same as Stadia's.
        return { ...BASEMAP_SPECS[mode], url: SATELLITE.url, attributions: SATELLITE.attributions, maxZoom: SATELLITE.maxZoom };
    }
    const preview = basemapFor(tiles, requested);
    return { url: preview.url, attributions: preview.attributions, maxZoom: preview.maxZoom, painted: false };
}

export function isBasemapMode(value: unknown): value is BasemapMode {
    return typeof value === "string" && (BASEMAP_MODES as readonly string[]).includes(value);
}

/**
 * The style a URL asks for. A tone's name is a style too: `?basemap=sage`
 * is the painted ground in sage, because that is what someone typing it
 * means, and it used to fall through to the default in silence. `?tone=` on
 * its own asks for the painted ground as well, since nothing else has a tone,
 * and so does `?tune`, since the panel it opens only tunes the painted ground.
 */
export function parseBasemapParam(search: string, hash: string): BasemapMode | null {
    const raw = queryParam(search, hash, "basemap");
    if (isBasemapMode(raw)) return raw;
    if (isPaintedToneName(raw) || isPaintedToneName(queryParam(search, hash, "tone"))) return "painted";
    if (isTuningRequested(search, hash)) return "painted";
    return null;
}

export function nextBasemapMode(mode: BasemapMode): BasemapMode {
    return BASEMAP_MODES[(BASEMAP_MODES.indexOf(mode) + 1) % BASEMAP_MODES.length];
}

/**
 * The style each walk opens on when the URL names none. Painted only for the
 * Pavilion walk, which Tate tuned it on (2026-10-12); DSU, Terrace and
 * Chatham are already being walked and keep the ground they shipped with.
 */
export const DEFAULT_MODE_BY_VARIANT: Record<Variant, BasemapMode> = {
    dsu: "outdoors",
    terrace: "outdoors",
    chatham: "outdoors",
    washpav: "painted",
};

function initialMode(): BasemapMode {
    if (typeof window === "undefined") {
        return "outdoors";
    }
    return (
        parseBasemapParam(window.location.search, window.location.hash) ??
        DEFAULT_MODE_BY_VARIANT[detectVariant(window.location)]
    );
}

/*
 * In memory only, not localStorage: a prototype choice that outlived the page
 * load could leave a phone walking on the wrong ground with nothing on screen
 * to say why. The URL is where a choice lives. Switching live is the Field
 * Console's, so it stays behind debug.
 */
let mode: BasemapMode = initialMode();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): BasemapMode {
    return mode;
}

export function setBasemapMode(next: BasemapMode) {
    if (!isDebugEnabled()) {
        return;
    }
    mode = next;
    window.__basemapMode = next;
    for (const listener of listeners) listener();
}

export function useBasemapMode(): BasemapMode {
    return useSyncExternalStore(subscribe, getSnapshot, () => "outdoors" as const);
}

export function useBasemapSpec(): BasemapSpec {
    return basemapSpecFor(useBasemapMode());
}
