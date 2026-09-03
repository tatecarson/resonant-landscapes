/**
 * Write the placed points for every variant to a file the renderer can read.
 *
 * Placement lives in TypeScript and rendering is easier in Python, so this is
 * the seam between them. Run through the npm script rather than on its own:
 *
 *     npm run render:sites
 */
import { writeFileSync } from 'node:fs';

import { getScaledPoints, getVariantCenter } from '../src/utils/scaledParks';

type Variant = 'dsu' | 'terrace' | 'chatham';

const VARIANTS: Variant[] = ['dsu', 'terrace', 'chatham'];

const payload = Object.fromEntries(
    VARIANTS.map(variant => [
        variant,
        {
            center: getVariantCenter(variant),
            points: getScaledPoints(variant).map(park => ({
                name: park.name,
                coords: park.scaledCoords,
            })),
        },
    ])
);

const out = new URL('../src/data/placements.generated.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${VARIANTS.length} variants to ${out.pathname}`);
