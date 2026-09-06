import { useEffect, useRef, useState } from "react";

/**
 * The event Chrome fires when it would have shown its own install banner.
 * Not in lib.dom, because it is not standardised: only Chromium ships it.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
}

function alreadyInstalled(): boolean {
    // Two spellings of the same fact. iOS answers navigator.standalone and
    // has never supported the media query; everything else is the reverse.
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const displayMode =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches;
    return iosStandalone || displayMode;
}

export interface InstallOffer {
    /**
     * Present only where the browser will actually install on request, which
     * today means Chromium. iOS has no such API, so there the guide carries
     * instructions and this stays null.
     */
    install: (() => Promise<void>) | null;
}

/**
 * The install affordance, which lives in the field guide and nowhere else
 * (rl-5yp).
 *
 * The popup over the map is gone, and with it the timing logic that tried to
 * catch the moment a walker was most likely to say yes. The guide is
 * permanent, so what is left is capability rather than timing: a button where
 * the browser can install on request, prose where it cannot.
 */
export function useInstallHint(): InstallOffer {
    const [installed, setInstalled] = useState(alreadyInstalled);
    /*
     * The event lives in a ref and the boolean drives rendering.
     *
     * prompt() may be called once per event: a second call rejects. With the
     * event in state alone, two taps in the same tick would both see it and
     * the second would throw, unhandled, because the button fires this as
     * void install(). Clearing a ref is synchronous, so the second tap finds
     * nothing to consume.
     */
    const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null);
    const [canInstall, setCanInstall] = useState(false);

    useEffect(() => {
        const capture = (event: Event) => {
            // Chrome shows its own banner unless this is cancelled, and a
            // banner over the map is the popup rl-5yp removed. Installing is
            // offered from the guide now, or not at all.
            event.preventDefault();
            promptEventRef.current = event as BeforeInstallPromptEvent;
            setCanInstall(true);
        };
        const onInstalled = () => setInstalled(true);

        window.addEventListener("beforeinstallprompt", capture);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", capture);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const install = canInstall && !installed
        ? async () => {
              const event = promptEventRef.current;
              if (!event) return;
              // Consumed before awaiting, so a double tap cannot reach it.
              promptEventRef.current = null;
              setCanInstall(false);

              try {
                  await event.prompt();
              } catch {
                  // An exhausted or refused prompt is not an error worth
                  // showing anyone: the button simply goes away. Whatever
                  // they chose, it is not offered again this session —
                  // a refusal is an answer.
              }
          }
        : null;

    return { install };
}
