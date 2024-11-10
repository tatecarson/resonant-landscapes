import { useState } from "react";
import { Feature, Point } from '@turf/helpers';
import { ErrorBoundary } from "react-error-boundary";
import ParkDialog from '../dialogs/ParkDialog';
import { ParkFeaturesLayer } from "./ParkFeaturesLayer";
import { Park } from "../../types/park";

interface ParkContainerProps {
    scaledPoints: Park[];
    userLocation: Feature<Point> | null;
    parkDistance: number;
    parkName: string;
}

export function ParkLayer({ scaledPoints, userLocation, parkName, parkDistance }: ParkContainerProps): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);

    return (
        <>
            <ParkFeaturesLayer
                scaledPoints={scaledPoints}
                maxDistance={15}
                userLocation={userLocation}
                onParkSelect={(name, coords) => {
                    setIsOpen(true);
                    setCurrentParkLocation(coords);
                }}
                isOpen={isOpen}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && (
                    <ParkDialog
                        isOpen={isOpen}
                        setIsOpen={setIsOpen}
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={false}
                    />
                )}
            </ErrorBoundary>
        </>
    );
}