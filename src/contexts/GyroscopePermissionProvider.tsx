import React, { useState, useEffect, useCallback } from 'react';
import useGimbalStore from '../stores/gimbalStore';

const GyroscopePermissionProvider = ({ children }) => {
    const [hasGyroPermission, setHasGyroPermission] = useState('not-determined');
    const setPermission = useGimbalStore((state) => state.setPermission);

    const requestPermission = useCallback(async () => {
        try {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                setHasGyroPermission(permission === 'granted');
                setPermission(permission);
            } else {
                console.log('Gyroscope not supported on this device');
                // Handle non-supporting devices
            }
        } catch (error) {
            console.error('Error requesting gyroscope permission:', error);
            // Handle permission request failure (e.g., inform user)
        }
    }, [setPermission]);

    useEffect(() => {
        const handleClick = () => requestPermission();

        handleClick(); // Request permission initially

        window.addEventListener('click', handleClick);

        return () => window.removeEventListener('click', handleClick);
    }, [requestPermission]);

    return (
        <div>
            {hasGyroPermission ? (
                <div>{children}</div>
            ) : (
                <div>
                    Gyroscope permission needed. Click the button to grant access.
                    <button onClick={requestPermission}>Enable Gyroscope</button>
                </div>
            )}
        </div>
    );
};

export default GyroscopePermissionProvider;
