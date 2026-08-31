import { describe, expect, it } from "vitest";
import { detectWebview } from "./webview";

/**
 * Real user agent strings, copied from the apps rather than invented, because
 * the whole check is a claim about what these apps actually write. A made-up
 * string would test the regex against itself.
 */
const UA = {
    safariIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    chromeAndroid:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    chromeIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1",
    firefoxIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
    desktopChrome:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    instagramIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90 (iPhone14,2; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 588527267)",
    instagramAndroid:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 Instagram 331.0.0.37.90 Android",
    facebookIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
    facebookAndroid:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.35.82;]",
    messengerIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/442.0.0.42.109;FBBV/560012345;FBDV/iPhone14,2]",
    tiktokAndroid:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6 musical_ly_34.5.4",
    snapchatIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.86.0.42 (like Safari/604.1)",
    twitterIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.45",
    linkedinIOS:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]",
    /** A plain WKWebView: no Safari token, no Version token. */
    bareWKWebView:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    /** A plain Android WebView, identified by the wv token. */
    bareAndroidWebView:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
};

describe("detectWebview", () => {
    it("leaves the browsers a walker chose alone", () => {
        // A false positive here costs nothing but a paragraph; a false
        // positive on Safari itself would tell every correct walker to go
        // somewhere else, which is the one outcome worth guarding.
        expect(detectWebview(UA.safariIOS)).toBeNull();
        expect(detectWebview(UA.chromeAndroid)).toBeNull();
        expect(detectWebview(UA.chromeIOS)).toBeNull();
        expect(detectWebview(UA.firefoxIOS)).toBeNull();
        expect(detectWebview(UA.desktopChrome)).toBeNull();
    });

    it("names the apps the piece is actually shared through", () => {
        expect(detectWebview(UA.instagramIOS)).toBe("instagram");
        expect(detectWebview(UA.instagramAndroid)).toBe("instagram");
        expect(detectWebview(UA.facebookIOS)).toBe("facebook");
        expect(detectWebview(UA.facebookAndroid)).toBe("facebook");
        expect(detectWebview(UA.tiktokAndroid)).toBe("tiktok");
        expect(detectWebview(UA.snapchatIOS)).toBe("snapchat");
        expect(detectWebview(UA.twitterIOS)).toBe("twitter");
        expect(detectWebview(UA.linkedinIOS)).toBe("linkedin");
    });

    it("prefers Messenger over Facebook, whose marker it also carries", () => {
        expect(UA.messengerIOS).toMatch(/FBAN/);
        expect(detectWebview(UA.messengerIOS)).toBe("messenger");
    });

    it("catches an unnamed webview on both platforms", () => {
        expect(detectWebview(UA.bareWKWebView)).toBe("unknown");
        expect(detectWebview(UA.bareAndroidWebView)).toBe("unknown");
    });

    it("says nothing when there is no user agent to read", () => {
        expect(detectWebview("")).toBeNull();
        expect(detectWebview()).toBeNull();
    });
});
