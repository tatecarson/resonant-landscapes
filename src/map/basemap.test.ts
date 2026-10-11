import { describe, expect, it } from "vitest";
import { basemapFor } from "./basemap";

describe("basemapFor", () => {
    it("uses Stadia when nothing asks otherwise, which is production", () => {
        expect(basemapFor(undefined).url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
        expect(basemapFor("").url).toMatch(/^https:\/\/tiles\.stadiamaps\.com\//);
    });

    it("uses OpenStreetMap's tiles, credited, where previews ask for them", () => {
        const osm = basemapFor("osm");
        expect(osm.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
        // OSM's tile usage policy requires the credit on the map.
        expect(osm.attributions).toMatch(/OpenStreetMap/);
        // Its server stops at z19 and answers z20 with a 400.
        expect(osm.maxZoom).toBe(19);
    });
});
