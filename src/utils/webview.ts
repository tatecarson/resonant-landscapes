/**
 * Whether this page was opened inside another app's browser.
 *
 * The piece is shared as a link, and a link tapped in Instagram, Facebook or
 * Messenger opens in that app's own webview rather than in Safari or Chrome.
 * That matters here more than it would for a normal page, because the two
 * things the walk cannot do without are exactly the two things in-app
 * webviews are worst at: turning the sound on from a tap, and asking for
 * permission to use the phone's motion sensors. Some iOS webviews do not
 * expose the motion prompt at all, so rotation can never be granted no matter
 * how many times the walker taps.
 *
 * This is user-agent sniffing, and it is not feature detection because there
 * is nothing to detect: a webview reports the same AudioContext and the same
 * DeviceOrientationEvent constructor as the browser it is built from, and
 * only fails later, in a park, after the walker has driven there. The cost of
 * a false positive is a paragraph suggesting they open the link elsewhere,
 * which is never harmful advice, so the checks below lean towards naming an
 * app only when its own marker is present.
 */

/** The app the page is sitting inside, when it can be named. */
export type WebviewHost =
    | "instagram"
    | "facebook"
    | "messenger"
    | "tiktok"
    | "snapchat"
    | "twitter"
    | "linkedin"
    | "pinterest"
    | "wechat"
    | "line"
    | "unknown";

/**
 * Markers each app writes into its user agent, in the order they are checked.
 * Messenger before Facebook: Messenger's string carries FBAN too, and the
 * more specific name is the one worth showing.
 */
const NAMED_HOSTS: [WebviewHost, RegExp][] = [
    ["messenger", /FBAN\/Messenger|MessengerForiOS|Orca-Android/i],
    ["instagram", /\bInstagram\b/i],
    ["facebook", /FBAN\/|FBAV\/|FB_IAB|FB4A/i],
    ["tiktok", /BytedanceWebview|musical_ly|\bTikTok\b/i],
    ["snapchat", /\bSnapchat\b/i],
    ["twitter", /Twitter for (iPhone|iPad|Android)|TwitterAndroid/i],
    ["linkedin", /LinkedInApp/i],
    ["pinterest", /\bPinterest\b/i],
    ["wechat", /MicroMessenger/i],
    ["line", /\bLine\/[\d.]/],
];

/** The iOS browsers that are not Safari but are still a real browser. */
const IOS_REAL_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/i;

/**
 * Name the host app, or null when this looks like a browser the walker chose.
 */
export function detectWebview(userAgent = ""): WebviewHost | null {
    if (!userAgent) return null;

    for (const [host, marker] of NAMED_HOSTS) {
        if (marker.test(userAgent)) return host;
    }

    // Android puts a literal "wv" token in the platform section of every
    // WebView-based user agent, which is as close to a standard signal as
    // this gets.
    if (/\bwv\b/.test(userAgent) && /Android/i.test(userAgent)) return "unknown";

    // On iOS every engine is WebKit, so the tell is what is missing: a
    // WKWebView reports no Safari token and no Version token, while Safari
    // itself and the third-party browsers above always carry one.
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    if (isIOS && !IOS_REAL_BROWSERS.test(userAgent) && !/Safari\//.test(userAgent)) {
        return "unknown";
    }

    return null;
}
