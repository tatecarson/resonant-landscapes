import React, { useRef, useEffect, useCallback } from 'react';

import Gimbal from '../utils/Gimbal';
import { useAudioEngine } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";

interface GimbalArrowProps {
    permissionGranted: boolean;
    onPermissionGranted: () => void;
    hideUI?: boolean;
}

const GimbalArrow = ({ permissionGranted, onPermissionGranted, hideUI = false }: GimbalArrowProps) => {
    const gimbalRef = useRef(new Gimbal());
    const yawDisplayRef = useRef<HTMLSpanElement>(null);
    const { resonanceAudioScene } = useAudioEngine();
    useRenderDebug("GimbalArrow", {
        permissionGranted,
        hasResonanceScene: Boolean(resonanceAudioScene),
    });

    const requestPermission = useCallback(async () => {
        const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;
        if (typeof DOE.requestPermission === 'function') {
            try {
                const permission = await DOE.requestPermission();
                if (permission === 'granted') {
                    gimbalRef.current.enable();
                    console.log("Permission granted");
                    onPermissionGranted();
                    localStorage.setItem('deviceOrientationPermission', 'granted');
                }
            } catch (error) {
                console.error("DeviceOrientationEvent.requestPermission error:", error);
            }
        } else {
            // Automatically grant permission if the browser does not support requestPermission
            onPermissionGranted();
        }
    }, [onPermissionGranted]);

    useEffect(() => {
        if (!permissionGranted) {
            requestPermission();
        }
    }, []);

    useEffect(() => {
        gimbalRef.current.enable();
        gimbalRef.current.recalibrate();

        return () => {
            gimbalRef.current.disable();
        };
    }, []);

    useEffect(() => {
        console.log("Permission granted:", permissionGranted);
        if (!permissionGranted) {
            return;
        }

        let animationFrameId: number;
        const renderLoop = () => {
            gimbalRef.current.update();

            const { vectorFwd, vectorUp } = gimbalRef.current;

            if (resonanceAudioScene) {
                resonanceAudioScene.setListenerOrientation(vectorFwd.x, vectorFwd.y, vectorFwd.z, vectorUp.x, vectorUp.y, vectorUp.z);
            }

            window.__gimbalOrientation = {
                fwdX: vectorFwd.x, fwdY: vectorFwd.y, fwdZ: vectorFwd.z,
                upX: vectorUp.x, upY: vectorUp.y, upZ: vectorUp.z,
                updatedAt: Date.now(),
            };

            if (yawDisplayRef.current) {
                const deg = Math.round((gimbalRef.current.yaw ?? 0) * (180 / Math.PI));
                yawDisplayRef.current.textContent = `${deg}°`;
            }

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop()

        return () => {
            cancelAnimationFrame(animationFrameId);
        }
    }, [permissionGranted, resonanceAudioScene]);

    if (!permissionGranted) {
        if (hideUI) return null;
        return (
            <div className="flex justify-center items-center h-screen">
                <button className="p-4 bg-blue-500 text-white rounded" onClick={requestPermission}>
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
