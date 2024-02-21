import React, { useState, useEffect, useCallback } from 'react';
import useGimbalStore from '../stores/gimbalStore';

const GyroscopePermissionProvider = ({ children }) => {
    const [hasGyroPermission, setHasGyroPermission] = useState(false);
    const setPermission = useGimbalStore((state) => state.setPermission);

    const requestPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                setHasGyroPermission(permission === 'granted');
                setPermission(permission);
            } catch (error) {
                console.error('Error requesting gyroscope permission:', error);
                // Handle permission request failure (e.g., inform user)
            }
        } else {
            console.log('Gyroscope not supported on this device');
            // Handle non-supporting devices
        }
    }, []);

    useEffect(() => {
        // Trigger permission request on button click or touch event
        // Replace 'handleClick' with your actual user interaction handler
        const handleClick = () => requestPermission();

        handleClick(); // Request permission initially

        // Optionally add event listener for later user interactions
        window.addEventListener('click', handleClick);

        return () => window.removeEventListener('click', handleClick);
    }, []);

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
