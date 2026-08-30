import React, { useRef, useEffect, useCallback } from 'react';

import Gimbal from '../utils/Gimbal';
import { requestDeviceOrientationPermission, watchOrientationAvailability } from '../utils/deviceOrientation';
import { useAudioEngine } from '../contexts/AudioContextProvider';
import { isDebugEnabled } from '../config/debug';
import { useRenderDebug } from "../hooks/useRenderDebug";

interface GimbalArrowProps {
    permissionGranted: boolean;
    onPermissionGranted: () => void;
    /** Fired when the grant is stale: enabled, but no orientation event ever arrived. */
    onOrientationUnavailable?: () => void;
    hideUI?: boolean;
}

const GimbalArrow = ({
    permissionGranted,
    onPermissionGranted,
    onOrientationUnavailable,
    hideUI = false,
}: GimbalArrowProps) => {
    // Lazily constructed: useRef(new Gimbal()) built and discarded a Gimbal
    // on every render.
    const gimbalRef = useRef<Gimbal | null>(null);
    if (gimbalRef.current === null) {
        gimbalRef.current = new Gimbal();
    }
    const gimbal = gimbalRef.current;
    const yawDisplayRef = useRef<HTMLSpanElement>(null);
    const { resonanceAudioScene } = useAudioEngine();
    useRenderDebug("GimbalArrow", {
        permissionGranted,
        hasResonanceScene: Boolean(resonanceAudioScene),
    });

    // Held in a ref: this callback is recreated on every ParkModal render, and
    // taking it as an effect dependency would tear down and re-enable the
    // gimbal — recalibrating the walker's heading — on unrelated renders.
    const onOrientationUnavailableRef = useRef(onOrientationUnavailable);
    useEffect(() => {
        onOrientationUnavailableRef.current = onOrientationUnavailable;
    }, [onOrientationUnavailable]);

    const requestPermission = useCallback(async () => {
        const granted = await requestDeviceOrientationPermission();
        if (granted) {
            onPermissionGranted();
        }
    }, [onPermissionGranted]);

    useEffect(() => {
        if (!permissionGranted) {
            return;
        }

        gimbal.enable();
        gimbal.recalibrate();

        // A stored grant can be stale. watchOrientationAvailability clears the
        // flag, but on its own that only helps the *next* session: this one
        // keeps showing "rotation tracking" over spatial audio that no longer
        // moves. Report it so the current session can recover too.
        const stopWatching = watchOrientationAvailability(() => {
            onOrientationUnavailableRef.current?.();
        });

        return () => {
            stopWatching();
            gimbal.disable();
        };
    }, [gimbal, permissionGranted]);

    useEffect(() => {
        if (!permissionGranted) {
            return;
        }

        let animationFrameId: number;
        const renderLoop = () => {
            gimbal.update();

            const { vectorFwd, vectorUp } = gimbal;

            if (resonanceAudioScene) {
                resonanceAudioScene.setListenerOrientation(vectorFwd.x, vectorFwd.y, vectorFwd.z, vectorUp.x, vectorUp.y, vectorUp.z);
            }

            if (isDebugEnabled()) {
                window.__gimbalOrientation = {
                    fwdX: vectorFwd.x, fwdY: vectorFwd.y, fwdZ: vectorFwd.z,
                    upX: vectorUp.x, upY: vectorUp.y, upZ: vectorUp.z,
                    updatedAt: Date.now(),
                };
            }

            if (yawDisplayRef.current) {
                const deg = Math.round(gimbal.yaw * (180 / Math.PI));
                yawDisplayRef.current.textContent = `${deg}°`;
            }

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [gimbal, permissionGranted, resonanceAudioScene]);

    if (!permissionGranted) {
        if (hideUI) return null;
        return (
            <div className="flex items-center justify-center py-2">
                <button
                    type="button"
                    onClick={requestPermission}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] inline-flex min-h-[44px] items-center rounded-full border border-neutral-900/30 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-white/30"
                >
                    Allow Orientation Access
                </button>
            </div>
        );
    }

    if (hideUI) return null;

    return (
        <p className="text-xs text-slate-400 tabular-nums">
            heading <span ref={yawDisplayRef}>—</span>
        </p>
    );
};

export default GimbalArrow;
