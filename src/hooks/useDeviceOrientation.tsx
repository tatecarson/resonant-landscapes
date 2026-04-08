import { useState, useEffect } from 'react';

const useDeviceOrientation = () => {
    const [orientation, setOrientation] = useState<{ alpha: number | null; beta: number | null; gamma: number | null }>({ alpha: null, beta: null, gamma: null });
    const [permissionGranted, setPermissionGranted] = useState(false);

    const handleOrientation = (event: DeviceOrientationEvent) => {
        const { alpha, beta, gamma } = event;
        setOrientation({ alpha, beta, gamma });
    };

    const requestPermission = async () => {
        const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;
        if (typeof DOE.requestPermission === 'function') {
            const permission = await DOE.requestPermission();
            if (permission === 'granted') {
                setPermissionGranted(true);
                window.addEventListener('deviceorientation', handleOrientation, true);
                localStorage.setItem('DeviceOrientationPermission', 'granted');
            } else {
                setPermissionGranted(false);
            }
        } else {
            setPermissionGranted(true);
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
    };

    useEffect(() => {
        const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;
        if (typeof DOE.requestPermission === 'function') {
            if (localStorage.getItem('DeviceOrientationPermission') === 'granted') {
                setPermissionGranted(true);
                window.addEventListener('deviceorientation', handleOrientation, true);
            }
        } else {
            setPermissionGranted(true);
            window.addEventListener('deviceorientation', handleOrientation, true);
        }

        return () => {
            window.removeEventListener('deviceorientation', handleOrientation, true);
        };
    }, []);

    return { orientation, permissionGranted, requestPermission };
};

export default useDeviceOrientation;
