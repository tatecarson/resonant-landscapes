import React, { useState, createContext, useContext } from 'react';

interface GyroscopePermissionContextType {
    hasGyroPermission: string;
    requestPermission: (e: React.MouseEvent) => void;
}

export const GyroscopePermissionContext = createContext<GyroscopePermissionContextType>({
    hasGyroPermission: 'not-determined',
    requestPermission: () => {},
});

const GyroscopePermissionProvider = ({ children }: { children: React.ReactNode }) => {
    const [hasGyroPermission, setHasGyroPermission] = useState('not-determined');

    const requestPermission = async (e: React.MouseEvent) => {
        try {
            e.preventDefault();
            const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;
            if (typeof DOE.requestPermission === 'function') {
                const permission = await DOE.requestPermission();
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
