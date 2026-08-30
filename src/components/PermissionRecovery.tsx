import {
    RECOVERY_STAKES,
    RECOVERY_TITLES,
    getRecoverySteps,
    type BlockedCapability,
} from "../utils/recoverySteps";

interface PermissionRecoveryProps {
    capability: BlockedCapability;
    /** Rendered as a dismiss control when the walk can continue without this. */
    onDismiss?: () => void;
}

/**
 * The steps out of a denied permission, in the piece's own voice.
 *
 * Numbered rather than bulleted: these are done in order, by someone standing
 * outside who is going to leave the page, change a setting, and come back. The
 * numerals stay visible as a place to return to.
 */
function PermissionRecovery({ capability, onDismiss }: PermissionRecoveryProps) {
    const steps = getRecoverySteps(capability, navigator.userAgent);

    return (
        <div
            className="rounded-2xl border border-neutral-900/25 bg-white/30 p-4"
            role="status"
            data-testid={`permission-recovery-${capability}`}
        >
            <p className="font-space-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-900">
                {RECOVERY_TITLES[capability]}
            </p>
            <p className="mt-1 font-space-mono text-[10px] leading-relaxed text-neutral-900/70">
                {RECOVERY_STAKES[capability]}
            </p>

            <ol className="mt-3 space-y-2 font-space-mono text-[10px] leading-relaxed text-neutral-900/75">
                {steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                        <span className="select-none tabular-nums text-neutral-900/40">
                            {index + 1}
                        </span>
                        <span>{step}</span>
                    </li>
                ))}
            </ol>

            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] mt-3 inline-flex min-h-[44px] items-center rounded-full px-1 font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/60 underline decoration-neutral-900/30 underline-offset-2 transition-colors hover:text-neutral-900"
                >
                    Continue without it
                </button>
            )}
        </div>
    );
}

export default PermissionRecovery;
