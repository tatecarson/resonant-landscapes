import React, { useRef, useState, useEffect, useCallback } from 'react';

import Gimbal from '../js/Gimbal';
import { useAudioContext } from '../contexts/AudioContextProvider';
import 'tailwindcss/tailwind.css';

const GimbalArrow = () => {
    const [gimbal] = useState(new Gimbal());
    const [permissionGranted, setPermissionGranted] = useState(false);
    const { resonanceAudioScene } = useAudioContext();

    const requestPermission = useCallback(async (event) => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    gimbal.enable();
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
        gimbal.enable();
        gimbal.recalibrate();

        return () => {
            gimbal.disable();
        };
    }, [gimbal]);

    useEffect(() => {
        console.log("Permission granted:", permissionGranted);
        if (!permissionGranted) {
            return;
        }

        let animationFrameId;
        const renderLoop = () => {
            gimbal.update();

            if (resonanceAudioScene) {
                resonanceAudioScene.setListenerOrientation(gimbal.vectorFwd.x, gimbal.vectorFwd.y, gimbal.vectorFwd.z, gimbal.vectorUp.x, gimbal.vectorUp.y, gimbal.vectorUp.z);
            }

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        renderLoop()

        return () => {
            cancelAnimationFrame(animationFrameId);
        }
    }, [permissionGranted, gimbal]);

    if (!permissionGranted) {
        return (
            <div className="flex justify-center items-center h-screen">
                <button className="p-4 bg-blue-500 text-white rounded" onClick={requestPermission}>
                    Allow Orientation Access
                </button>
            </div>
        );
    }

};

export default GimbalArrow;
