import React, { useState, useEffect } from 'react';
import useGimbalPermissionStore from '../stores/gimbalPermissionStore';

const GyroscopePermissionProvider = ({ children }) => {
    const [hasGyroPermission, setHasGyroPermission] = useState('not-determined');
    const setPermission = useGimbalPermissionStore((state) => state.setPermission);

    // Define requestPermission function directly within the component function
    const requestPermission = async () => {
        try {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                setHasGyroPermission(permission === 'granted' ? 'granted' : 'denied');
                console.log(`Gyroscope permission: ${permission}`);
                setPermission(permission);
            } else {
                console.log('Gyroscope not supported on this device.');
                setHasGyroPermission('unsupported');
                // Optionally, handle the scenario when the device does not support Gyroscope
            }
        } catch (error) {
            console.error('Error requesting gyroscope permission:', error);
            setHasGyroPermission('denied');
        }
    };

    useEffect(() => {
        // Optionally, auto-request permission or check the current permission state here
        // For example, checking permission status on component mount
    }, []); // Empty dependency array ensures this runs once on mount

    return (
        <div>
            {hasGyroPermission === 'granted' ? (
                children
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
