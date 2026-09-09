/**
 * Which walk a URL opens.
 *
 * Reported from Terrace Park: the walker opened `/terrace/` and got the DSU
 * placement, whose nearest recording is 59 km from where they were standing.
 * The map was green and completely empty — no marker, no glow — and they
 * panned across the whole park looking for spots that were never there
 * (rl-c8f).
 *
 * Nothing on screen could have told them. The site is named once, on the
 * welcome screen, and iOS Safari's address bar shows only the host, so the
 * trailing slash was invisible too. A route that silently picks the wrong
 * continent is the worst failure this app has, because it looks exactly like
 * a walk with nothing near it.
 *
 * Asserted on the welcome copy rather than on the map: it is the one place
 * the variant is named in words, it needs no position fix, and it is what a
 * walker can actually check before setting off.
 */
import { expect, test } from "@playwright/test";

const WALKS = {
    dsu: /walk dsu's campus/i,
    terrace: /walk terrace park/i,
    chatham: /walk chatham's campus/i,
} as const;

/*
 * Both spellings of every route, because both are things people hold. The
 * path form is what gets printed, shared and typed — and what picks up a
 * trailing slash on the way. The hash form is what the specs and the QR
 * codes use.
 */
const ROUTES: [string, keyof typeof WALKS][] = [
    ["/", "dsu"],
    ["/terrace", "terrace"],
    ["/terrace/", "terrace"],
    ["/#/terrace", "terrace"],
    ["/#/terrace/", "terrace"],
    ["/chatham", "chatham"],
    ["/chatham/", "chatham"],
    ["/#/chatham", "chatham"],
    ["/#/chatham/", "chatham"],
];

for (const [route, walk] of ROUTES) {
    test(`${route} opens the ${walk} walk`, async ({ page }) => {
        await page.goto(route);
        await expect(page.getByText(WALKS[walk])).toBeVisible({ timeout: 15_000 });
    });
}
