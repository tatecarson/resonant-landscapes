import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapContainer, TileLayer, useMap, Marker, Popup, useMapEvents } from 'react-leaflet'
import "leaflet/dist/leaflet.css";
// import L from "leaflet";
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

function LocationMarker({ setCurrentPosition }) {
    const map = useMap();

    useEffect(() => {
        // map.invalidateSize()
        map.locate({ setView: true, maxZoom: 16 }).on('locationfound', (e) => {
            setCurrentPosition(e.latlng); // Update parent component's state
            map.flyTo(e.latlng, map.getZoom());
        });

    }, [map, setCurrentPosition]);

    return null; // Marker is managed via map events
}

const GeoLocatedScene = ({ refLatitude, refLongitude }) => {
    const [isClose, setIsClose] = useState(false);
    const [distanceToRef, setDistanceToRef] = useState(null);
    const [bearing, setBearing] = useState(0);
    const [alpha, setAlpha] = useState(null);
    const [currentPosition, setCurrentPosition] = useState({ lat: 0, lng: 0 });
    const [mapHeight, setMapHeight] = useState(window.innerHeight);

    useEffect(() => {
        const watchID = navigator.geolocation.watchPosition(position => {
            const { latitude, longitude } = position.coords;

            setCurrentPosition({ lat: latitude, lng: longitude });
        }, error => console.error(`ERROR(${error.code}): ${error.message}`), {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 27000,
        });

        return () => navigator.geolocation.clearWatch(watchID);
    }, []);

    useEffect(() => {
        if (currentPosition.lat && currentPosition.lng && refLatitude && refLongitude) {
            const refPoint = turf.point([refLongitude, refLatitude]);
            const currentPoint = turf.point([currentPosition.lng, currentPosition.lat]);
            const options = { units: 'meters' };
            const distance = turf.distance(refPoint, currentPoint, options);
            const bearing = turf.bearing(refPoint, currentPoint);

            setDistanceToRef(distance);
            setBearing(bearing);
            setIsClose(distance < 2);
        }
    }, [currentPosition, refLatitude, refLongitude]);

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

    // useEffect(() => {
    //     const handleResize = () => {
    //         setMapHeight(window.innerHeight);
    //     };

    //     window.addEventListener('resize', handleResize);

    //     // Cleanup
    //     return () => window.removeEventListener('resize', handleResize);
    // }, []);

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            <button onClick={requestGyroPermission} style={{ position: 'absolute', zIndex: 10 }}>
                Enable Orientation
            </button>
            <MapContainer
                center={currentPosition}
                zoom={13}
                style={{ height: '100%', width: '100%', position: 'absolute', zIndex: 1 }}
                scrollWheelZoom={false}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker setCurrentPosition={setCurrentPosition} />
            </MapContainer>
            <Canvas style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 2 }} camera={{ position: [0, 0, 5] }}>
                <ambientLight />
                <pointLight position={[10, 10, 10]} />
                {!isClose && <GeoLocatedArrow bearing={bearing} alpha={alpha} />}
            </Canvas>
            {distanceToRef !== null && (
                <div style={{ position: 'absolute', top: '30px', left: '10px', zIndex: 5, color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
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
