import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
    BRUSH_SLIDERS,
    PAINTED_TONES,
    PAINTED_TONE_NAMES,
    STREET_SLIDERS,
    TONE_SLIDERS,
    encodeTuning,
    getPaintTuning,
    isPaintTuningSaved,
    resetPaintTuning,
    savePaintTuning,
    setPaintTuning,
    subscribePaintTuning,
    usePaintTuning,
    type PaintTuning,
} from "../config/paintTuning";

/**
 * Sliders for the painted ground, opened with `?tune` (rl-ffdd).
 *
 * For finding a look by eye on the phone, on the walk, without a round trip
 * through code. Every change shows at once. "Save on this phone" keeps it for
 * later loads on this device; "Copy link" carries it to another device as a
 * `?paint=` link; "Copy settings" is the JSON to paste into
 * config/paintTuning.ts DEFAULTS when a tuning should become everyone's.
 *
 * Rendered into the body, not the map, so dragging a slider never pans it.
 * Along the bottom and under half the screen, so the ground around the
 * walker's marker in the middle stays in view while it changes.
 */

function format(value: number, step: number): string {
    const places = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
    return value.toFixed(places);
}

function SliderRow({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="block">
            <span className="flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                <span>{label}</span>
                <span className="font-semibold text-ink">{format(value, step)}</span>
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="mt-1 h-6 w-full accent-edge"
            />
        </label>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2 rounded-2xl bg-white/[42%] px-3 py-3">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-muted">{title}</h3>
            {children}
        </section>
    );
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // No clipboard access (an older iOS, or a denied permission): show
        // it in a prompt, where it can be selected and copied by hand.
        window.prompt("Copy this:", text);
        return false;
    }
}

function shareLink(tuning: PaintTuning): string {
    const url = new URL(window.location.href);
    url.searchParams.set("basemap", "painted");
    url.searchParams.set("tune", "");
    url.searchParams.set("paint", encodeTuning(tuning));
    url.searchParams.delete("tone");
    return url.toString().replace("tune=&", "tune&").replace(/tune=$/, "tune");
}

const buttonShape =
    "rounded-full border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition";
/** Separate rather than layered: two background classes on one element leave the winner to stylesheet order. */
const button = `${buttonShape} border-edge/15 bg-white/45 text-ink hover:border-edge/30 hover:bg-white/65`;
const buttonStrong = `${buttonShape} border-edge bg-edge text-ground hover:bg-ink`;

export default function PaintTuningPanel() {
    const tuning = usePaintTuning();
    const saved = useSyncExternalStore(subscribePaintTuning, isPaintTuningSaved, () => false);
    const [open, setOpen] = useState(true);
    const [notice, setNotice] = useState<string | null>(null);

    const update = (change: (draft: PaintTuning) => void) => {
        const draft: PaintTuning = JSON.parse(JSON.stringify(getPaintTuning()));
        change(draft);
        setPaintTuning(draft);
        setNotice(null);
    };
    const tone = tuning.tones[tuning.tone];
    const ramp = PAINTED_TONES[tuning.tone].ramp;

    const panel = open ? (
        <div
            data-testid="paint-tuning-panel"
            className="pointer-events-auto fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] flex max-h-[44dvh] flex-col overflow-hidden rounded-[1.6rem] border border-edge/15 bg-ground/[90%] text-[11px] text-ink shadow-console backdrop-blur-md sm:left-3 sm:right-auto sm:w-[22rem]"
        >
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-muted">Tune the ground</p>
                    <p className="text-[11px] text-ink-muted">{saved ? "Saved on this phone" : "Not saved yet"}{notice ? ` · ${notice}` : ""}</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className={button}>
                    Hide
                </button>
            </div>

            <div className="space-y-3 overflow-y-auto overscroll-contain px-3 pb-3">
                <Section title="Colour scheme">
                    <div className="flex gap-2">
                        {PAINTED_TONE_NAMES.map((name) => (
                            <button
                                key={name}
                                type="button"
                                aria-pressed={tuning.tone === name}
                                onClick={() => update((draft) => { draft.tone = name; })}
                                className={`${tuning.tone === name ? buttonStrong : button} flex-1`}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                    {TONE_SLIDERS.map((slider) => (
                        <SliderRow
                            key={slider.key}
                            label={slider.label}
                            min={slider.min}
                            max={slider.max}
                            step={slider.step}
                            value={tone[slider.key]}
                            onChange={(value) => update((draft) => { draft.tones[draft.tone][slider.key] = value; })}
                        />
                    ))}
                    {tone.stops.map((stop, index) => (
                        <SliderRow
                            key={`stop-${index}`}
                            label={`Ramp: ${ramp[index + 1].token} at`}
                            value={stop}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(value) => update((draft) => { draft.tones[draft.tone].stops[index] = value; })}
                        />
                    ))}
                </Section>

                <Section title="Brush">
                    {BRUSH_SLIDERS.map((slider) => (
                        <SliderRow
                            key={slider.key}
                            label={slider.label}
                            min={slider.min}
                            max={slider.max}
                            step={slider.step}
                            value={tuning[slider.key]}
                            onChange={(value) => update((draft) => { draft[slider.key] = value; })}
                        />
                    ))}
                </Section>

                <Section title="Streets and sidewalks">
                    {STREET_SLIDERS.map((slider) => (
                        <SliderRow
                            key={slider.key}
                            label={slider.label}
                            min={slider.min}
                            max={slider.max}
                            step={slider.step}
                            value={tuning.streets[slider.key]}
                            onChange={(value) => update((draft) => { draft.streets[slider.key] = value; })}
                        />
                    ))}
                </Section>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-edge/10 px-3 py-3">
                <button
                    type="button"
                    onClick={() => setNotice(savePaintTuning() ? "saved" : "could not save")}
                    className={buttonStrong}
                >
                    Save on this phone
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (window.confirm("Reset every slider to the defaults and forget this phone's saved tuning?")) {
                            resetPaintTuning();
                            setNotice("reset");
                        }
                    }}
                    className={button}
                >
                    Reset
                </button>
                <button
                    type="button"
                    onClick={() => void copyText(shareLink(tuning)).then((ok) => ok && setNotice("link copied"))}
                    className={button}
                >
                    Copy link
                </button>
                <button
                    type="button"
                    onClick={() => void copyText(JSON.stringify(tuning, null, 2)).then((ok) => ok && setNotice("settings copied"))}
                    className={button}
                >
                    Copy settings
                </button>
            </div>
        </div>
    ) : (
        <button
            type="button"
            data-testid="paint-tuning-open"
            onClick={() => setOpen(true)}
            className={`${button} pointer-events-auto fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] shadow-console`}
        >
            Tune
        </button>
    );

    return createPortal(panel, document.body);
}
