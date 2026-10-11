import { useSyncExternalStore } from "react";
import { createXYZ } from "ol/tilegrid";
import type TileGrid from "ol/tilegrid/TileGrid";
import { isDebugEnabled } from "./debug";

/**
 * Candidate basemaps for a more painted ground (rl-ffdd), switchable under
 * debug so they can be judged by eye at the zoom the walk is actually read at.
 *
 * Stamen Watercolor is the look, but Stadia stops serving it at zoom 16 and the
 * walk rests at about 18.5, so asking for it there returns holes. The two
 * prototypes are the two ways round that:
 *
 * - `watercolor` caps the source at 16 and lets OpenLayers enlarge those tiles
 *   (about 5.6x at resting zoom). The detail goes; the washes stay.
 * - `painted` starts from imagery that is sharp to zoom 20 and paints it in the
 *   browser with a Kuwahara pass (PaintedBasemap.ts), so detail never runs out.
 *
 * `outdoors` is what ships, and the default everywhere.
 */
export const BASEMAP_MODES = ["outdoors", "watercolor", "painted"] as const;
export type BasemapMode = (typeof BASEMAP_MODES)[number];

export interface BasemapSpec {
    url: string;
    /** Constant objects only: rlayers rebuilds the source when this changes identity. */
    tileGrid?: TileGrid;
    /** Needed when the pixels are read back, which a painted pass has to do. */
    crossOrigin?: string;
    attributions: string;
    painted: boolean;
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
        painted: false,
    },
    watercolor: {
        url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
        tileGrid: WATERCOLOR_GRID,
        attributions: [STADIA_CREDIT, STAMEN_CREDIT, OSM_CREDIT].join(" "),
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
        painted: true,
    },
};

export function isBasemapMode(value: unknown): value is BasemapMode {
    return typeof value === "string" && (BASEMAP_MODES as readonly string[]).includes(value);
}

/** `?basemap=` from the search or from the query inside the hash, as `?mock=` is read. */
export function parseBasemapParam(search: string, hash: string): BasemapMode | null {
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const raw = new URLSearchParams(search).get("basemap") ?? new URLSearchParams(hashQuery).get("basemap");
    return isBasemapMode(raw) ? raw : null;
}

export function nextBasemapMode(mode: BasemapMode): BasemapMode {
    return BASEMAP_MODES[(BASEMAP_MODES.indexOf(mode) + 1) % BASEMAP_MODES.length];
}

function initialMode(): BasemapMode {
    if (typeof window === "undefined" || !isDebugEnabled()) {
        return "outdoors";
    }
    return parseBasemapParam(window.location.search, window.location.hash) ?? "outdoors";
}

/*
 * In memory only, not localStorage: a prototype choice that outlived the page
 * load could leave a phone walking on the wrong ground with nothing on screen
 * to say why.
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
