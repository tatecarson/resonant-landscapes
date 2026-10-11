/**
 * Where the map's ground comes from.
 *
 * Stadia is the real basemap, and it authorizes one domain at a time. Every
 * Netlify deploy preview and branch deploy is another domain, so there the
 * tiles come back 401 and a preview opened to check placements on foot shows
 * the points floating on a blank field (rl-qavo). netlify.toml sets
 * VITE_MAP_TILES=osm for those contexts, the same way it switches counting
 * off, and the production build never sees it.
 *
 * OpenStreetMap's own tiles because they need no key: CARTO was the first
 * choice and now answers every request with an "API key required" image.
 * OSM's usage policy allows light use like a few people checking previews,
 * provided the map credits OpenStreetMap, which the attribution does. It
 * renders to z19; past that OpenLayers stretches the z19 tile.
 */
export type Basemap = {
    url: string;
    maxZoom: number;
    attributions: string;
};

const STADIA: Basemap = {
    url: "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png",
    maxZoom: 20,
    attributions:
        'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>.',
};

const OSM: Basemap = {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attributions:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

/** The basemap for a build, from VITE_MAP_TILES. Anything but "osm" is Stadia. */
export function basemapFor(tiles: string | undefined): Basemap {
    return tiles === "osm" ? OSM : STADIA;
}

export const basemap = basemapFor(import.meta.env.VITE_MAP_TILES);
