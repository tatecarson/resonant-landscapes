/**
 * Hear the two new Fort Sisseton recordings, headed (rl-ijl).
 *
 * Not an assertion suite. This walks to the park and dwells there with the
 * sound on, so a person can listen and decide whether the water drip and the
 * wind belong alongside the other parks — the one question no measurement in
 * that issue can answer.
 *
 * The seed is forced rather than drawn. With three recordings a random seed
 * gives a one-in-three chance of the recording that already shipped, and
 * this is here to audition the new ones.
 */
import { expect, test } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Fort Sisseton on the DSU site, from scripts/dump-placements.ts. */
const PARK = { latitude: 44.01330913748, longitude: -97.11118914495 };
const AWAY = { latitude: 44.0200, longitude: -97.11118914495 };

/** getVariantSeed() is Math.floor(random() * 0x7fffffff); these land on the
 *  two recordings this PR adds. */
const SEEDS = { "2-001 (water drip)": 0.0, "3-001 (wind)": 9.313225750491594e-10 };

const DWELL_MS = Number(process.env.AUDITION_MS ?? 45_000);

for (const [label, random] of Object.entries(SEEDS)) {
    test(`listen to Fort-Sisseton-${label}`, async ({ page, context, baseURL }) => {
        test.setTimeout(DWELL_MS + 120_000);
        await context.grantPermissions(["geolocation"], { origin: new URL(baseURL!).origin });
        await context.setGeolocation(AWAY);
        await seedOrientationPermission(page);
        await page.addInitScript((value) => { Math.random = () => value; }, random);

        const requested: string[] = [];
        page.on("request", (r) => {
            if (/Fort-Sisseton/.test(r.url())) requested.push(r.url().split("/").slice(-2).join("/"));
        });

        await page.goto("/");
        await dismissWelcomeModal(page);

        // Walk in and stay put; the fix re-sends position so the walk keeps tracking.
        const deadline = Date.now() + DWELL_MS;
        await context.setGeolocation(PARK);
        await expect(page.getByRole("button", { name: "Stop playback" }))
            .toBeVisible({ timeout: 60_000 });
        console.log(`\n[audition] PLAYING — ${label}`);
        console.log(`[audition] fetched: ${[...new Set(requested)].join(", ")}`);
        console.log(`[audition] listening for ${DWELL_MS / 1000}s…\n`);
        while (Date.now() < deadline) {
            await page.waitForTimeout(1000);
            await context.setGeolocation(PARK);
        }
    });
}
