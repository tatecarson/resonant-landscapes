import { describe, expect, it } from "vitest";
import { basemapFor, requestedMap } from "./basemap";

describe("basemapFor", () => {
    it("uses Stadia when the build names no map, which is production", () => {
        expect(basemapFor(undefined).url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
        expect(basemapFor("").url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
    });

    it("never lets a URL take production off Stadia", () => {
        expect(basemapFor(undefined, "satellite").url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
        expect(basemapFor(undefined, "streets").url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
    });

    it("opens previews on aerial imagery, credited", () => {
        const satellite = basemapFor("satellite");
        expect(satellite.url).toContain("World_Imagery/MapServer/tile/{z}/{y}/{x}");
        expect(satellite.attributions).toMatch(/Esri/);
    });

    it("swaps a preview to OpenStreetMap's streets on ?map=streets", () => {
        const streets = basemapFor("satellite", "streets");
        expect(streets.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
        // OSM's tile usage policy requires the credit on the map.
        expect(streets.attributions).toMatch(/OpenStreetMap/);
        // Its server stops at z19 and answers z20 with a 400.
        expect(streets.maxZoom).toBe(19);
    });

    it("ignores a ?map= it does not know", () => {
        expect(basemapFor("satellite", "moon").url).toContain("World_Imagery");
    });
});

describe("requestedMap", () => {
    it("reads ?map= from the search string or a hash route's query", () => {
        expect(requestedMap({ search: "?map=streets", hash: "" })).toBe("streets");
        expect(requestedMap({ search: "", hash: "#/washpav?mock=43.5,-96.7&map=streets" })).toBe("streets");
        expect(requestedMap({ search: "", hash: "#/washpav" })).toBeNull();
    });
});
