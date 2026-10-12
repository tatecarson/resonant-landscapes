/**
 * Where the map's ground comes from.
 *
 * Stadia is the real basemap, and it authorizes one domain at a time. Every
 * Netlify deploy preview and branch deploy is another domain, so there the
 * tiles came back 401 and a preview opened to check placements on foot showed
 * the points floating on a blank field (rl-qavo). netlify.toml sets
 * VITE_MAP_TILES for those contexts, the same way it switches counting off,
 * and the production build never sees it.
 *
 * Which style is drawn, and so which of these a page asks for, is
 * src/config/basemap.ts; this module says what a preview can show.
 *
 * Previews open on aerial imagery, because they exist to check where the
 * listening spots stand: whether one is in a car park, on a sidewalk, at a
 * door. `?map=streets` swaps in OpenStreetMap's street map. Production
 * ignores the parameter and is always Stadia.
 *
 * Both need no key. Esri's World Imagery allows non-commercial and
 * development use with its credit shown; it is sharp downtown to z20. (USGS
 * imagery is public domain but has nothing over Sioux Falls past z16.)
 * OpenStreetMap's tiles allow light use like previews with its credit, and
 * stop at z19, past which OpenLayers stretches the z19 tile. CARTO was tried
 * first and now needs an API key.
 */
export type Basemap = {
    url: string;
    maxZoom: number;
    attributions: string;
};

const STADIA: Basemap = {
    url: "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png",
    maxZoom: 20,
    /**
     * The credit Stadia requires for Outdoors (docs.stadiamaps.com/attribution).
     * This used to credit Stamen under CC BY 3.0, left over from the Stamen tiles
     * the map showed before PR #26 moved it to Outdoors (rl-lar8).
     */
    attributions: [
        '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank">Stadia Maps</a>',
        '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>',
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    ].join(" "),
};

const STREETS: Basemap = {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attributions:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const SATELLITE: Basemap = {
    // Esri's tile path is row before column: {y} then {x}.
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 20,
    attributions:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};

const BY_NAME: Record<string, Basemap> = {
    osm: STREETS,
    streets: STREETS,
    satellite: SATELLITE,
};

/**
 * The basemap for a build. `tiles` is VITE_MAP_TILES: unset is production,
 * which is Stadia whatever the URL says. Otherwise `requested`, from the
 * page's `?map=`, wins when it names a map, and the build's own choice when
 * it does not.
 */
export function basemapFor(tiles: string | undefined, requested?: string | null): Basemap {
    if (!tiles) return STADIA;
    return BY_NAME[requested ?? ""] ?? BY_NAME[tiles] ?? STADIA;
}

/**
 * `?map=` from the search string or from the query part of a hash route
 * (`#/washpav?map=streets`), the same two places `?mock=` is read from.
 */
export function requestedMap(location: Pick<Location, "search" | "hash">): string | null {
    const fromSearch = new URLSearchParams(location.search).get("map");
    if (fromSearch) return fromSearch;
    const hashQuery = location.hash.split("?")[1] ?? "";
    return new URLSearchParams(hashQuery).get("map");
}
