import { useEffect } from "react";
import GeoJSON from "ol/format/GeoJSON";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type TileSource from "ol/source/Tile";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import { Stroke, Style } from "ol/style";
import { unByKey } from "ol/Observable";
import { useOL } from "rlayers";
import { palette, withAlpha } from "../theme/palette";
import { getVariantCenter } from "../utils/scaledParks";
import type { Variant } from "../utils/variant";

/**
 * Streets and sidewalks drawn over the painted grounds (rl-ffdd).
 *
 * Painting the aerial imagery turns white roofs and pale concrete the same
 * cream, so the sidewalks a walker navigates by blend into the buildings
 * beside them. These lines come from OpenStreetMap, fetched once per walk by
 * scripts/fetch-street-lines.ts, and put the streets and sidewalks back on
 * top: streets as cream bands with a faint edge, sidewalks and crossings as
 * thin dark-green lines just outside them.
 *
 * Widths are in metres on the ground, not pixels, so the lines keep their
 * place against the imagery under them through every zoom. Every colour is a
 * palette token.
 *
 * Above the tile layer and under everything else, and faded with it: the
 * arrival dissolve sets the tile layer's opacity, and these follow it so the
 * streets go with the ground they are drawn on.
 */

type Kind = "street" | "service" | "path";

/** Drawn width on the ground, in metres, and the pixel range it is held to. */
const WIDTH: Record<Kind, { metres: number; min: number; max: number }> = {
    street: { metres: 7, min: 3, max: 26 },
    service: { metres: 3.5, min: 2, max: 12 },
    path: { metres: 0.8, min: 1.25, max: 3 },
};
const EDGE_ALPHA: Record<Kind, number> = { street: 0.3, service: 0.22, path: 0.42 };

const LOADERS: Record<Variant, () => Promise<{ default: unknown }>> = {
    dsu: () => import("../data/streetLines/dsu.json"),
    terrace: () => import("../data/streetLines/terrace.json"),
    chatham: () => import("../data/streetLines/chatham.json"),
    washpav: () => import("../data/streetLines/washpav.json"),
};

/** Paths first, then service roads, then streets on top, as on a printed map. */
const Z_ORDER: Record<Kind, number> = { path: 0, service: 1, street: 2 };

function styleFor(groundMetresPerUnit: number) {
    const cache = new Map<string, Style[]>();
    return (feature: FeatureLike, resolution: number): Style[] => {
        const kind = (feature.get("kind") as Kind) ?? "path";
        const { metres, min, max } = WIDTH[kind];
        const width = Math.round(Math.min(max, Math.max(min, metres / (resolution * groundMetresPerUnit))) * 2) / 2;
        const key = `${kind}:${width}`;
        let styles = cache.get(key);
        if (!styles) {
            styles =
                kind === "path"
                    ? [new Style({ zIndex: Z_ORDER.path, stroke: new Stroke({ color: withAlpha(palette.edge, EDGE_ALPHA.path), width, lineCap: "round", lineJoin: "round" }) })]
                    : [
                          new Style({ zIndex: Z_ORDER[kind] * 2, stroke: new Stroke({ color: withAlpha(palette.edge, EDGE_ALPHA[kind]), width: width + 2, lineCap: "round", lineJoin: "round" }) }),
                          new Style({ zIndex: Z_ORDER[kind] * 2 + 1, stroke: new Stroke({ color: withAlpha(palette.ground, 0.92), width, lineCap: "round", lineJoin: "round" }) }),
                      ];
            cache.set(key, styles);
        }
        return styles;
    };
}

/**
 * `basemapKey` is anything that changes when the tile layer is rebuilt (the
 * style does), so the opacity link is made again to the layer now showing.
 */
export default function StreetLinesLayer({
    variant,
    visible,
    basemapKey,
}: {
    variant: Variant;
    visible: boolean;
    basemapKey: string;
}): null {
    const { map } = useOL();

    useEffect(() => {
        if (!map || !visible) {
            return;
        }

        // Web Mercator units are metres only at the equator; at the walk's
        // latitude a unit covers cos(latitude) metres of ground.
        const latitude = getVariantCenter(variant)[1];
        const source = new VectorSource();
        const layer = new VectorLayer({
            source,
            style: styleFor(Math.cos((latitude * Math.PI) / 180)),
            zIndex: 0,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
        });
        map.addLayer(layer);

        const basemap = map
            .getLayers()
            .getArray()
            .find((candidate): candidate is TileLayer<TileSource> => candidate instanceof TileLayer);
        layer.setOpacity(basemap?.getOpacity() ?? 1);
        const opacityKey = basemap?.on("change:opacity", () => layer.setOpacity(basemap.getOpacity()));

        let cancelled = false;
        LOADERS[variant]()
            .then(({ default: data }) => {
                if (cancelled) return;
                // OL 8 types readFeatures as FeatureLike; GeoJSON only ever makes Features.
                source.addFeatures(new GeoJSON().readFeatures(data, { featureProjection: "EPSG:3857" }) as Feature[]);
            })
            .catch((error) => console.warn("[street lines] could not load", variant, error));

        return () => {
            cancelled = true;
            if (opacityKey) unByKey(opacityKey);
            map.removeLayer(layer);
            source.dispose();
            layer.dispose();
        };
    }, [map, variant, visible, basemapKey]);

    return null;
}
