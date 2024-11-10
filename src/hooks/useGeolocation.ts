import { useState, useCallback } from 'react';
import { LineString, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import * as turf from '@turf/turf';
import { getCenterWithHeading } from '../utils/mapUtils';

export const useGeolocation = (
    map: any, view: any, positions: any, deltaMean: number, previousM: number, setPreviousM: any,
    setUserLocation: any, scaledPoints: any, isOpen: boolean, setIsOpen: any, setParkName: any,
    currentParkLocation: [number, number] | null, setCurrentParkLocation: any, setParkDistance: any,
    resonanceAudioScene: any, stopSound: any
) => {
    const [pos, setPos] = useState(new Point(fromLonLat([0, 0]), 'XYZM'));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);

    const updateView = useCallback(() => {
        if (!view) return;

        let m = Date.now() - deltaMean * 1.5;
        m = Math.max(m, previousM);
        setPreviousM(m);
        const c = positions.getCoordinateAtM(m, true);

        if (c) {
            const mapSize = map?.getSize();
            if (!mapSize) return;

            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0, mapSize));
            view.setRotation(-c[2]);
            setPos(c);

            const coordinates = toLonLat([c[0], c[1]]);
            const newUserLocation = turf.point([coordinates[0], coordinates[1]]);
            setUserLocation(newUserLocation);

            scaledPoints.forEach((park: any) => {
                try {
                    const parkLocation = turf.point(park.scaledCoords);
                    const distance = turf.distance(newUserLocation, parkLocation, { units: 'meters' });
                    if (distance < 15 && !isOpen) {
                        setIsOpen(true);
                        setParkName(park.name);
                        setCurrentParkLocation(park.scaledCoords as [number, number]);
                    }
                } catch (error) {
                    console.error('Error calculating distance:', error);
                }
            });

            if (currentParkLocation) {
                try {
                    const currentParkDistance = turf.distance(newUserLocation, turf.point(currentParkLocation), { units: 'meters' });
                    if (currentParkDistance < 15) {
                        setParkDistance(currentParkDistance);
                        if (resonanceAudioScene) {
                            resonanceAudioScene.setListenerPosition(currentParkDistance, currentParkDistance, 0);
                        }
                    } else if (isOpen) {
                        setIsOpen(false);
                        stopSound();
                    }
                } catch (error) {
                    console.error('Error calculating current park distance:', error);
                }
            }
        }
    }, [view, deltaMean, previousM, positions, map, setPreviousM, setPos, setUserLocation, scaledPoints, isOpen, setIsOpen, setParkName, currentParkLocation, setCurrentParkLocation, setParkDistance, resonanceAudioScene, stopSound]);

    return { pos, accuracy, setAccuracy, updateView };
};