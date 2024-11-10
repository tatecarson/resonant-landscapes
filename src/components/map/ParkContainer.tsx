import { useState } from "react";
import { Feature, Point } from '@turf/helpers';
import { ErrorBoundary } from "react-error-boundary";
import ParkModal from "../ParkModal";
import { ParkFeatures } from "./ParkFeatures";
import { Park } from "../../types/park";

interface ParkContainerProps {
    scaledPoints: Park[];
    userLocation: Feature<Point> | null;
}

export function ParkContainer({ scaledPoints, userLocation }: ParkContainerProps): JSX.Element {
    const [isOpen, setIsOpen] = useState(false);
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);

    return (
        <>
            <ParkFeatures
                scaledPoints={scaledPoints}
                maxDistance={15}
                userLocation={userLocation}
                onParkSelect={(name, coords) => {
                    setIsOpen(true);
                    setParkName(name);
                    setCurrentParkLocation(coords);
                }}
                isOpen={isOpen}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && (
                    <ParkModal
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