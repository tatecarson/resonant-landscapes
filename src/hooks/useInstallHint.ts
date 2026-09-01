import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { detectPlatform, type WalkPlatform } from "../utils/recoverySteps";
import { useHeardParks } from "./heardParks";

const STORAGE_KEY = "installHintDismissed";

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

function readDismissed(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
        // Blocked storage means the hint may reappear next session. Showing a
        // dismissed hint twice is a smaller failure than never showing it.
        return false;
    }
}

/**
 * Module level, not component state, because two places ask.
 *
 * The hint renders itself, and the map reads the same answer so the
 * nearest-park chip can yield the bottom slot rather than stack underneath.
 * With a useState in each, dismissing updated only the hint's copy: the hint
 * vanished, the map went on believing it was showing, and the chip stayed
 * suppressed behind a hint that was no longer there. Both disappeared.
 *
 * Same shape as heardParks and the reduce-visuals preference, for the same
 * reason: one value, several readers, and no tree to hang a provider on.
 */
let dismissedStore = readDismissed();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function setDismissedStore(value: boolean) {
    dismissedStore = value;
    try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        // Keep it dismissed for this session at least.
    }
    for (const listener of listeners) listener();
}

/** Test seam, and what a "show me that again" control would call. */
export function resetInstallHintDismissal() {
    setDismissedStore(false);
}

export interface InstallHint {
    /** Whether to put the hint on screen at all. */
    show: boolean;
    /** Which wording to use. Copy only, never a capability gate. */
    platform: WalkPlatform;
    /**
     * Present only where the browser will actually install on request, which
     * today means Chromium. iOS has no such API, so there the hint carries
     * instructions and this stays null.
     */
    install: (() => Promise<void>) | null;
    dismiss: () => void;
}

/**
 * Whether to offer the walk as something to keep.
 *
 * Timed rather than immediate. A walker who has not heard a park yet has no
 * reason to install anything, and asking before the piece has done anything
 * is the banner pattern everybody has learned to dismiss without reading.
 * After the first park they know whether they want more of it, and what
 * installing buys is concrete: a full screen, and a walk that opens with no
 * signal.
 *
 * The trigger costs nothing: rl-1u7.10 already records heard parks.
 */
export function useInstallHint(): InstallHint {
    const heardParks = useHeardParks();
    const dismissed = useSyncExternalStore(subscribe, () => dismissedStore, () => true);
    const [installed, setInstalled] = useState(alreadyInstalled);
    const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        const capture = (event: Event) => {
            // Chrome shows its own banner unless this is cancelled, and its
            // timing is the one this hook exists to avoid.
            event.preventDefault();
            setPromptEvent(event as BeforeInstallPromptEvent);
        };
        const onInstalled = () => setInstalled(true);

        window.addEventListener("beforeinstallprompt", capture);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", capture);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const dismiss = useCallback(() => setDismissedStore(true), []);

    const install = promptEvent
        ? async () => {
              await promptEvent.prompt();
              // Whatever they chose, do not ask again: a refusal is an answer.
              dismiss();
          }
        : null;

    return {
        show: heardParks.size > 0 && !dismissed && !installed,
        platform: detectPlatform(navigator.userAgent),
        install,
        dismiss,
    };
}
