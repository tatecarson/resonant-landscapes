import { describe, expect, it } from "vitest";
import { BASEMAP_MODES, BASEMAP_SPECS, DEFAULT_MODE_BY_VARIANT, WATERCOLOR_MAX_ZOOM, type BasemapMode, basemapSpecFor, nextBasemapMode, parseBasemapParam, parsePaintedTone } from "./basemap";

describe("parseBasemapParam", () => {
    it("reads the search string", () => {
        expect(parseBasemapParam("?debug&basemap=painted", "")).toBe("painted");
    });

    it("reads the query inside the hash, as the variant routes carry it", () => {
        expect(parseBasemapParam("", "#/terrace?debug&basemap=watercolor")).toBe("watercolor");
    });

    it("reads a tone's name, or a tone on its own, as the painted ground", () => {
        expect(parseBasemapParam("?basemap=sage", "")).toBe("painted");
        expect(parseBasemapParam("?basemap=paper", "")).toBe("painted");
        expect(parseBasemapParam("?tone=paper", "")).toBe("painted");
        expect(parseBasemapParam("", "#/washpav?basemap=mint")).toBe("painted");
        expect(parseBasemapParam("?tune", "")).toBe("painted");
        expect(parseBasemapParam("?tune&basemap=watercolor", "")).toBe("watercolor");
    });

    it("ignores anything that is not a known basemap", () => {
        expect(parseBasemapParam("?basemap=toner", "")).toBeNull();
        expect(parseBasemapParam("", "")).toBeNull();
    });
});

describe("nextBasemapMode", () => {
    it("visits every mode and comes back round", () => {
        const seen: BasemapMode[] = [BASEMAP_MODES[0]];
        for (let i = 1; i < BASEMAP_MODES.length; i++) {
            seen.push(nextBasemapMode(seen[i - 1]));
        }
        expect(seen).toEqual([...BASEMAP_MODES]);
        expect(nextBasemapMode(seen[seen.length - 1])).toBe(BASEMAP_MODES[0]);
    });
});

describe("BASEMAP_SPECS", () => {
    it("keeps the shipped ground as it was", () => {
        expect(BASEMAP_SPECS.outdoors.url).toBe("https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png");
        expect(BASEMAP_SPECS.outdoors.crossOrigin).toBeUndefined();
        expect(BASEMAP_SPECS.outdoors.painted).toBe(false);
    });

    it("never asks for watercolor past the zoom Stadia serves it to", () => {
        expect(BASEMAP_SPECS.watercolor.tileGrid?.getMaxZoom()).toBe(WATERCOLOR_MAX_ZOOM);
    });

    it("asks for readable pixels wherever the ground is painted", () => {
        for (const spec of Object.values(BASEMAP_SPECS)) {
            if (spec.painted) {
                expect(spec.crossOrigin).toBe("anonymous");
            }
        }
    });
});

describe("parsePaintedTone", () => {
    it("reads the search string and the hash query", () => {
        expect(parsePaintedTone("?basemap=painted&tone=mint", "")).toBe("mint");
        expect(parsePaintedTone("", "#/terrace?tone=sage")).toBe("sage");
    });

    it("takes a tone named as the basemap, with ?tone= winning", () => {
        expect(parsePaintedTone("?basemap=sage", "")).toBe("sage");
        expect(parsePaintedTone("?basemap=sage&tone=paper", "")).toBe("paper");
        expect(parsePaintedTone("?basemap=painted", "")).toBeNull();
    });

    it("ignores unknown tones", () => {
        expect(parsePaintedTone("?tone=magenta", "")).toBeNull();
    });
});

describe("basemapSpecFor", () => {
    it("draws every style from Stadia in production", () => {
        for (const mode of BASEMAP_MODES) {
            expect(basemapSpecFor(mode, undefined, null)).toBe(BASEMAP_SPECS[mode]);
        }
    });

    it("paints the collage from the same imagery, by its own pass", () => {
        expect(BASEMAP_SPECS.collage.url).toBe(BASEMAP_SPECS.painted.url);
        expect(BASEMAP_SPECS.collage.paintStyle).toBe("collage");
        expect(BASEMAP_SPECS.painted.paintStyle).toBe("brush");
        expect(basemapSpecFor("collage", "satellite", null).url).toContain("server.arcgisonline.com");
        expect(basemapSpecFor("collage", "satellite", null).paintStyle).toBe("collage");
    });

    it("paints Esri's imagery on a preview, where Stadia refuses the domain", () => {
        const spec = basemapSpecFor("painted", "satellite", null);
        expect(spec.url).toContain("server.arcgisonline.com");
        expect(spec.painted).toBe(true);
        expect(spec.crossOrigin).toBe("anonymous");
    });

    it("shows the preview's own map for the plain styles, honouring ?map=", () => {
        expect(basemapSpecFor("outdoors", "satellite", null).url).toContain("server.arcgisonline.com");
        expect(basemapSpecFor("outdoors", "satellite", "streets").url).toContain("tile.openstreetmap.org");
        expect(basemapSpecFor("watercolor", "satellite", null).url).not.toContain("stadiamaps");
        expect(basemapSpecFor("watercolor", "satellite", null).painted).toBe(false);
    });
});

describe("DEFAULT_MODE_BY_VARIANT", () => {
    it("opens every walk on Outdoors until the painted ground has a production satellite source", () => {
        expect(DEFAULT_MODE_BY_VARIANT).toEqual({
            dsu: "outdoors",
            terrace: "outdoors",
            chatham: "outdoors",
            washpav: "outdoors",
        });
    });
});
