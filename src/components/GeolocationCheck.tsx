import React, { useState, useEffect } from 'react';

interface GeolocationCheckProps {
    children: React.ReactNode;
}

const GeolocationCheck: React.FC<GeolocationCheckProps> = ({ children }) => {
    const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

    useEffect(() => {
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLon = position.coords.longitude;
                    setUserLocation({ lat: userLat, lon: userLon });

                    const dsuLat = 44.0122;
                    const dsuLon = -97.1108;
                    const distance = getDistanceFromLatLonInKm(userLat, userLon, dsuLat, dsuLon);
                    setDistance(distance);

                    if (distance <= 1) { // Allow access if within 1 km
                        setIsAllowed(true);
                    } else {
                        setIsAllowed(false);
                    }
                },
                () => {
                    setIsAllowed(false);
                }
            );

            return () => {
                navigator.geolocation.clearWatch(watchId);
            };
        } else {
            console.error("Geolocation is not supported by this browser.");
            setIsAllowed(false);
        }
    }, []);

    const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    };

    const deg2rad = (deg: number) => {
        return deg * (Math.PI / 180);
    };

    if (isAllowed === false) {
        return (
            <div className="bg-red-100 text-red-700 border border-red-400 p-4 rounded-md text-center my-4">
                <p>You need to be closer to Dakota State University to use this app.</p>
                {distance !== null && (
                    <p>You are {distance.toFixed(2)} km away from Dakota State University.</p>
                )}
            </div>
        );
    }

    return (
        <>
            {isAllowed === null ? (
                <div>Loading...</div>
            ) : (
                <>
                    {isAllowed ? (
                        children
                    ) : (
                        <div className="bg-red-100 text-red-700 border border-red-400 p-4 rounded-md text-center my-4">
                            <p>You need to be closer to Dakota State University to use this app.</p>
                            {distance !== null && (
                                <p>You are {distance.toFixed(2)} km away from Dakota State University.</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default GeolocationCheck;
