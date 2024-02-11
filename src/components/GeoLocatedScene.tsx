import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as turf from '@turf/turf';

function createArrowShape() {
    const arrowShape = new THREE.Shape();

    // Start drawing the arrow
    arrowShape.moveTo(0, 0.5);   // Tip of the arrow
    arrowShape.lineTo(-0.5, -0.5);  // Bottom left
    arrowShape.lineTo(-0.2, -0.5);
    arrowShape.lineTo(-0.2, -1); // Tail bottom left
    arrowShape.lineTo(0.2, -1);  // Tail bottom right
    arrowShape.lineTo(0.2, -0.5);
    arrowShape.lineTo(0.5, -0.5);  // Bottom right
    arrowShape.lineTo(0, 0.5);   // Back to tip

    return arrowShape;
}

function createArrowMesh(bearing) {
    const arrowShape = createArrowShape();
    const extrudeSettings = {
        steps: 2,
        depth: 0.1,  // Thickness of the arrow
        bevelEnabled: false,  // No bevel for simplicity
    };

    const geometry = new THREE.ExtrudeGeometry(arrowShape, extrudeSettings);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Blue color
    const mesh = new THREE.Mesh(geometry, material);

    const bearingRadians = THREE.MathUtils.degToRad(bearing);
    mesh.rotation.y = bearingRadians; // Rotate the arrow to point in the bearing direction

    return mesh;
}

const GeoLocatedArrow = ({ bearing, alpha }) => {
    const arrowMeshRef = useRef();
    const { scene } = useThree();

    useFrame(() => {
        if (arrowMeshRef.current && alpha !== null) {
            const totalBearing = (bearing - alpha + 360) % 360;
            const bearingRadians = THREE.MathUtils.degToRad(totalBearing);
            arrowMeshRef.current.rotation.z = bearingRadians;
        }
    });

    useEffect(() => {
        const initialArrowMesh = createArrowMesh(0);
        scene.add(initialArrowMesh);
        arrowMeshRef.current = initialArrowMesh;
        return () => scene.remove(arrowMeshRef.current);
    }, [scene]);

    return null; // This component does not render anything itself
};

const GeoLocatedScene = ({ refLatitude, refLongitude }) => {
    const [isClose, setIsClose] = useState(false);
    const [distanceToRef, setDistanceToRef] = useState(null);
    const [bearing, setBearing] = useState(0);
    const [alpha, setAlpha] = useState(null);
    const [currentLatitude, setCurrentLatitude] = useState();
    const [currentLongitude, setCurrentLongitude] = useState();

    useEffect(() => {
        const watchID = navigator.geolocation.watchPosition(position => {
            const { latitude, longitude } = position.coords;
            setCurrentLatitude(latitude);
            setCurrentLongitude(longitude);
        }, error => console.error(`ERROR(${error.code}): ${error.message}`), {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 27000,
        });

        return () => navigator.geolocation.clearWatch(watchID);
    }, []);

    useEffect(() => {
        if (currentLatitude && currentLongitude) {
            const refPoint = turf.point([refLongitude, refLatitude]);
            const currentPoint = turf.point([currentLongitude, currentLatitude]);
            const options = { units: 'meters' };
            const distance = turf.distance(refPoint, currentPoint, options);
            const bearing = turf.bearing(refPoint, currentPoint);

            setDistanceToRef(distance);
            setBearing(bearing);
            setIsClose(distance < 2);
        }
    }, [currentLatitude, currentLongitude, refLatitude, refLongitude]);

    const handleOrientation = useCallback((event) => {
        const { alpha } = event;
        setAlpha(alpha);
    }, []);

    const requestGyroPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            } else {
                console.log('Gyroscope permission not granted');
            }
        } else {
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
    }, [handleOrientation]);

    return (
        <div>
            <button onClick={requestGyroPermission}>Enable Orientation</button>
            <Canvas style={{ width: '100%', height: '100vh', background: isClose ? 'green' : 'black' }} camera={{ position: [0, 0, 5] }}>
                <ambientLight />
                <pointLight position={[10, 10, 10]} />
                {!isClose && <GeoLocatedArrow bearing={bearing} alpha={alpha} />}
            </Canvas>
            {distanceToRef !== null && (
                <div style={{ position: 'absolute', top: '30px', left: '10px', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
                    {isClose
                        ? `You're close to the reference point! Distance: ${distanceToRef.toFixed(2)} meters`
                        : `You're not close to the reference point. Distance: ${distanceToRef.toFixed(2)} meters. Bearing: ${bearing.toFixed(2)} degrees. Alpha: ${alpha !== null ? alpha.toFixed(2) : 'N/A'}`
                    }
                </div>
            )}
        </div>
    );
};


export default GeoLocatedScene;
