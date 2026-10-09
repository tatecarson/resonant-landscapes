/** Which walk this page is: the DSU campus, Terrace Park or Chatham. */
export type Variant = "dsu" | "terrace" | "chatham";

/**
 * A route with its trailing slashes taken off, so `/terrace` and `/terrace/`
 * are the same walk.
 *
 * Not a tidying pass. A walker in Terrace Park opened `/terrace/`, which fell
 * through every check below to the DSU placement 59 km away, and got a map
 * with no marker and no glow anywhere on it — nothing on screen said which
 * walk was loaded, and iOS Safari hides the path in its address bar, so there
 * was no way to see the slash either (rl-c8f). A share sheet, a typed URL, a
 * link with a slash on the end and a QR code printed by someone else all
 * produce this, and the failure is silent every time.
 *
 * The root is left as "/" rather than reduced to "": nothing matches on it,
 * but it should read as a path.
 */
export function normalizeRoute(route: string) {
  return route.replace(/\/+$/, "") || "/";
}

/**
 * The walk a URL asks for, by path (`/chatham`) or by hash (`#/chatham`).
 *
 * Its own module so main.tsx can name the site to the visitor count before
 * React renders, as well as App choosing the walk to show.
 */
export function detectVariant(location: Location): Variant {
  const hashRoute = normalizeRoute(location.hash.replace(/^#/, "").split("?")[0]);
  const path = normalizeRoute(location.pathname);
  if (hashRoute === "/terrace" || path.endsWith("/terrace")) {
    return "terrace";
  }
  if (hashRoute === "/chatham" || path.endsWith("/chatham")) {
    return "chatham";
  }
  return "dsu";
}
