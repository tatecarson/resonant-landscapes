import React, { useRef, useState, useEffect, useCallback } from 'react';

import Gimbal from '../utils/Gimbal';
import { useAudioEngine } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";

const GimbalArrow = () => {
    const gimbalRef = useRef(new Gimbal());
    const yawDisplayRef = useRef<HTMLSpanElement>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
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
                    setPermissionGranted(true);
                    localStorage.setItem('deviceOrientationPermission', 'granted'); // Store permission state
                }
            } catch (error) {
                console.error("DeviceOrientationEvent.requestPermission error:", error);
            }
        } else {
            // Automatically grant permission if the browser does not support requestPermission
            setPermissionGranted(true);
        }
    }, []);


    useEffect(() => {
        if (!permissionGranted) {
            requestPermission();
        }
    }, [])

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
        return (
            <div className="flex justify-center items-center h-screen">
                <button className="p-4 bg-blue-500 text-white rounded" onClick={requestPermission}>
                    Allow Orientation Access
                </button>
            </div>
        );
    }

    return (
        <p className="text-xs text-slate-400 tabular-nums">
            heading <span ref={yawDisplayRef}>—</span>
        </p>
    );
};

export default GimbalArrow;
