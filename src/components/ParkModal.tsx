import { useRef, memo, useState, useEffect, useMemo } from 'react'
import { useAudioPlaybackState } from "../contexts/AudioContextProvider";
import { useRenderDebug } from "../hooks/useRenderDebug";
import HOARenderer from './HoaRenderer';
import ArrivalField from './ArrivalField';
import PermissionRecovery from './PermissionRecovery';
import { park as parkCopy } from '../copy';
import { hasStoredOrientationPermission, requestDeviceOrientationPermission } from "../utils/deviceOrientation";
import { canOfferRotation, rotationStaysOn } from "../utils/rotationOffer";
import { selectVariant } from "../utils/audioPaths";
import { useActiveReplayVariant } from "../hooks/activeReplay";
import stateParks from "../data/stateParks.json";


interface ParkModalProps {
    parkName: string;
    parkDistance: number;
    /** The walker has reached this park's centre and not left the park since. */
    userOrientation: boolean;
    mapHeading: number;
    suppressed?: boolean;
}

/** Short enough to read as a tap on the shoulder, not a notification. */
const ROTATION_OFFER_BUZZ_MS = 40;

function ParkModal({
    parkName,
    parkDistance,
    userOrientation,
    mapHeading,
    suppressed = false,
}: ParkModalProps) {
    const { isPlaying } = useAudioPlaybackState();
    const [rotationActive, setRotationActive] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(() => hasStoredOrientationPermission());
    const [rotationDismissed, setRotationDismissed] = useState(false);
    // Set when the walker asked for rotation and the device said no. Until
    // now this branch did nothing at all: the button was tapped, the promise
    // resolved "denied", and the UI did not move — which reads as a broken
    // button rather than a setting they can go and change.
    const [rotationBlocked, setRotationBlocked] = useState(false);
    const reachedCenter = userOrientation;
    const showRotationButton = canOfferRotation({ isPlaying, reachedCenter });
    const offeringRotation = showRotationButton && !rotationActive && !rotationBlocked;
    // One control, two states: the offer before, the switch-off after. Hidden
    // only while the recovery panel stands in for it.
    const showRotationToggle = showRotationButton && !rotationBlocked;
    // Explained once per arrival. A walker who turned rotation off on purpose
    // has read it, and saying it again would be nagging.
    const explainRotation = offeringRotation && !rotationDismissed;

    useRenderDebug("ParkModal", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        suppressed,
        rotationActive,
        permissionGranted,
    });

    /**
     * Which of a park's recordings this walker is hearing. The seed draws
     * one per session — stable for the visit, different across visits, and
     * that variety is deliberate. When the walk is replaying a held
     * recording instead of the seed's choice, the replay's number wins: the
     * sentence has to describe what is playing, not what was drawn.
     */
    const seededVariant = useMemo(
        () => (parkName ? selectVariant(parkName, stateParks, navigator.userAgent) : null),
        [parkName]
    );
    const replayVariantNumber = useActiveReplayVariant(parkName);
    const variant = useMemo(
        () => (seededVariant && replayVariantNumber
            ? { ...seededVariant, number: replayVariantNumber }
            : seededVariant),
        [seededVariant, replayVariantNumber]
    );

    /**
     * aria-hidden on a container whose Stop and rotation buttons stay
     * focusable is undefined behaviour: the ARIA spec says hidden subtrees
     * leave the accessibility tree, but a focusable element inside one is a
     * contradiction assistive tech resolves differently. On a phone that
     * reaches iOS Switch Control and Android Switch Access, which step through
     * focusable elements — the mobile equivalent of tabbing — and a paired
     * keyboard with Full Keyboard Access.
     *
     * `inert` resolves it properly by removing the subtree from focus order
     * as well. React 18 does not forward the attribute, so it is set on the
     * node directly.
     */
    const suppressedStripRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const strip = suppressedStripRef.current;
        if (!strip) {
            return;
        }

        if (suppressed) {
            strip.setAttribute("inert", "");
        } else {
            strip.removeAttribute("inert");
        }
    }, [suppressed]);

    // Reset rotation state when park changes
    useEffect(() => {
        setRotationActive(false);
        setPermissionGranted(hasStoredOrientationPermission());
        setRotationDismissed(false);
    }, [parkName]);

    // Deactivate rotation when playback stops; also clear dismissed flag so
    // auto-enable can fire again when the user next starts audio.
    useEffect(() => {
        if (!isPlaying) {
            setRotationActive(false);
            setRotationDismissed(false);
        }
    }, [isPlaying]);

    // Reset the manual dismissal when the user leaves center conditions.
    useEffect(() => {
        if (!showRotationButton) {
            setRotationDismissed(false);
        }
    }, [showRotationButton]);

    // Rotation belongs to the spot the walker reached. It used to switch off
    // the moment a fix drifted past 3 m, which ordinary GPS does standing
    // still; now it lasts until they leave the park (see rotationOffer).
    useEffect(() => {
        if (rotationActive && !rotationStaysOn({ reachedCenter })) {
            setRotationActive(false);
        }
    }, [rotationActive, reachedCenter]);

    // One short buzz the first time the offer appears at a park, for a walker
    // listening with the phone lowered. Android only: iOS Safari has no
    // vibrate, and the call is simply absent there.
    const buzzedForParkRef = useRef<string | null>(null);
    useEffect(() => {
        if (!offeringRotation || buzzedForParkRef.current === parkName) {
            return;
        }
        buzzedForParkRef.current = parkName;
        try {
            if ("vibrate" in navigator) navigator.vibrate(ROTATION_OFFER_BUZZ_MS);
        } catch {
            // A refused or unsupported vibrate is not worth surfacing.
        }
    }, [offeringRotation, parkName]);

    // Auto-enable rotation when all conditions are met at park center.
    useEffect(() => {
        if (!permissionGranted || !showRotationButton || rotationActive || rotationDismissed) {
            return;
        }

        setRotationActive(true);
    }, [permissionGranted, rotationDismissed, rotationActive, showRotationButton]);

    async function enableRotation() {
        if (!permissionGranted) {
            const granted = await requestDeviceOrientationPermission();
            if (!granted) {
                setRotationBlocked(true);
                return;
            }
            setPermissionGranted(true);
        }

        setRotationBlocked(false);

        setRotationDismissed(false); // user explicitly re-enabled — clear any prior dismissal
        setRotationActive(true);
    }

    const hoaRendererProps = {
        parkName,
        parkDistance,
        userOrientation,
        rotationActive,
        onRotationActiveChange: setRotationActive,
        permissionGranted,
        onPermissionGranted: () => setPermissionGranted(true),
        // iOS only accepts requestPermission() during a user gesture, so
        // "re-prompt" means putting the Enable Rotation button back rather
        // than prompting from here — which would throw NotAllowedError.
        onOrientationUnavailable: () => {
            setRotationActive(false);
            setPermissionGranted(false);
            setRotationDismissed(false);
            setRotationBlocked(true);
        },
    };

    return (
        <>
                {/*
                  * Mounted for the whole park rather than only once rotation
                  * is on, and never suppressed for the field guide. It is not
                  * an effect that belongs to head tracking any more — it is
                  * the last fifteen metres of the walk, and a walker who never
                  * grants orientation used to arrive at nothing at all.
                  */}
                <ArrivalField
                    parkDistance={parkDistance}
                    headingRadians={mapHeading}
                    rotationActive={rotationActive}
                />

                <div
                    ref={suppressedStripRef}
                    className={`fixed bottom-0 left-0 right-0 z-50 bg-panel shadow-strip transition-opacity duration-150 ${
                        suppressed ? "pointer-events-none opacity-0" : "opacity-100"
                    }`}
                    aria-hidden={suppressed}
                >
                    <div className="px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))]">

                        {/* Park identity */}
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-display text-[22px] leading-tight font-medium text-ink min-w-0 truncate">
                                {parkName}
                            </p>
                        </div>

                        <div className="mt-0.5 flex items-center gap-1.5">
                            {isPlaying && (
                                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink/60 animate-pulse" aria-hidden="true" />
                            )}
                            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink/70">
                                {Math.floor(parkDistance)} m away
                                {variant && variant.total > 1
                                    ? ` · ${parkCopy.recordingOf(variant.number, variant.total)}`
                                    : ""}
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="my-3 h-px bg-ink/10" />

                        {/*
                          * Above the controls, for the reason the silent-mode
                          * hint is (rl-1u7.18). This panel is 323px tall and
                          * used to render after the controls row, so on a
                          * phone that has refused orientation access it stood
                          * between STOP and the strip's anchored bottom edge
                          * and lifted the button most of a screen — the same
                          * failure as the hint's 23px, several times over.
                          *
                          * Opening upward is also the better read: the panel
                          * explains something, and the controls it explains
                          * stay where the thumb already found them.
                          */}
                        {explainRotation && (
                            <div
                                data-testid="rotation-callout"
                                role="status"
                                className="rotation-callout mb-3 border-l-2 border-ink/35 pl-3"
                            >
                                <p className="font-display text-[15px] font-medium leading-snug text-ink">
                                    {parkCopy.atCenter}
                                </p>
                                <p className="mt-0.5 font-display text-[13px] leading-snug text-ink/75">
                                    {parkCopy.rotationHint}
                                </p>
                            </div>
                        )}

                        {rotationBlocked && (
                            <div className="mb-3">
                                <PermissionRecovery
                                    capability="orientation"
                                    onDismiss={() => setRotationBlocked(false)}
                                />
                            </div>
                        )}

                        {/* Controls row. Bottom-aligned, so the rotation
                            offer and Stop share a baseline even while the
                            silent-phone hint stacks above Stop. */}
                        <div className="flex items-end justify-between gap-4">

                            {/*
                              * Left: rotation, one control in two states. Off,
                              * it is the offer; on, it is filled and says so,
                              * and tapping it turns rotation off. Hidden while
                              * the recovery panel is up: once iOS has been told
                              * no, requestPermission resolves "denied" without
                              * prompting, so the offer would be a no-op that
                              * still looks live. "Continue without it" brings
                              * it back.
                              */}
                            <div className="flex-shrink-0">
                                {showRotationToggle ? (
                                    <button
                                        type="button"
                                        data-testid="rotation-toggle"
                                        data-state={rotationActive ? "on" : "off"}
                                        aria-label={rotationActive ? parkCopy.rotationOnAriaLabel : undefined}
                                        onClick={() => {
                                            if (rotationActive) {
                                                setRotationDismissed(true);
                                                setRotationActive(false);
                                            } else {
                                                void enableRotation();
                                            }
                                        }}
                                        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                                            rotationActive
                                                ? "rotation-toggle--on bg-accent text-on-ink hover:bg-accent-soft"
                                                : "rotation-affordance text-ink hover:bg-white/30"
                                        }`}
                                    >
                                        <span
                                            className={`${rotationActive ? "rotation-toggle__glyph--on" : "rotation-affordance__glyph"} text-sm leading-none`}
                                            aria-hidden="true"
                                        >
                                            ↻
                                        </span>
                                        <span>{rotationActive ? parkCopy.rotationOn : parkCopy.enableRotation}</span>
                                    </button>
                                ) : (
                                    // Holds the row's balance while there is
                                    // nothing to offer, or the recovery panel
                                    // has taken the control's place.
                                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink/25 select-none">
                                        ✦
                                    </span>
                                )}
                            </div>

                            {/* Right: audio controls */}
                            <HOARenderer {...hoaRendererProps} />
                        </div>

                    </div>
                </div>
        </>
    );
}

export default memo(ParkModal)
