import React, { useState, useEffect, createContext, useContext } from 'react';

// Create a context with a default value
export const GyroscopePermissionContext = createContext({
    hasGyroPermission: 'not-determined',
    requestPermission: () => { },
});

const GyroscopePermissionProvider = ({ children }) => {
    const [hasGyroPermission, setHasGyroPermission] = useState('not-determined');

    const requestPermission = async (e) => {
        try {
            e.preventDefault();
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                setHasGyroPermission(permission === 'granted' ? 'granted' : 'denied');
            } else {
                console.log('Gyroscope not supported on this device.');
                setHasGyroPermission('unsupported');
            }
        } catch (error) {
            console.error('Error requesting gyroscope permission:', error);
            setHasGyroPermission('denied');
        }
    };

    return (
        <GyroscopePermissionContext.Provider value={{ hasGyroPermission, requestPermission }}>
            {children}
        </GyroscopePermissionContext.Provider>
    );
};



export default GyroscopePermissionProvider;
