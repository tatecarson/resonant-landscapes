import React, { useRef, useEffect, useCallback } from 'react';

import Gimbal from '../utils/Gimbal';
import { requestDeviceOrientationPermission, watchOrientationAvailability } from '../utils/deviceOrientation';
import { useAudioEngine } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";

interface GimbalArrowProps {
    permissionGranted: boolean;
    onPermissionGranted: () => void;
    hideUI?: boolean;
}

const GimbalArrow = ({ permissionGranted, onPermissionGranted, hideUI = false }: GimbalArrowProps) => {
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

        // A stored grant can be stale; if no orientation event arrives the
        // flag is cleared so the next session re-prompts.
        const stopWatching = watchOrientationAvailability();

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

            window.__gimbalOrientation = {
                fwdX: vectorFwd.x, fwdY: vectorFwd.y, fwdZ: vectorFwd.z,
                upX: vectorUp.x, upY: vectorUp.y, upZ: vectorUp.z,
                updatedAt: Date.now(),
            };

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
