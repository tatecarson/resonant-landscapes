import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

// Helper function to convert latitude and longitude to meters (simplified)
const latLongToMeters = (lat1, long1, lat2, long2) => {
    const earthRadiusMeters = 6371000;
    const dLat = THREE.MathUtils.degToRad(lat2 - lat1);
    const dLon = THREE.MathUtils.degToRad(long2 - long1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(THREE.MathUtils.degToRad(lat1)) * Math.cos(THREE.MathUtils.degToRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusMeters * c;
    return distance;
};

// Helper function to calculate the bearing between two points
function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = lat1 * Math.PI / 180; // Convert degrees to radians
    const phi2 = lat2 * Math.PI / 180;
    const lambda1 = lon1 * Math.PI / 180;
    const lambda2 = lon2 * Math.PI / 180;

    const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
    const theta = Math.atan2(y, x);
    const bearing = (theta * 180 / Math.PI + 360) % 360; // Convert radians to degrees and normalize
    return bearing;
}

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


const setupThreeJS = (mountRef, sceneRef, cubeRef, arrowMesh) => {
    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(arrowMesh);
    arrowMesh.position.set(0, 2, 0);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cubeRef.current = cube;

    camera.position.z = 5;

    const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    };
    animate();

    return { scene, camera, renderer, cube };
};

const GeoLocatedScene = ({ refLatitude, refLongitude }) => {
    const mountRef = useRef(null);
    const sceneRef = useRef(new THREE.Scene());
    const cubeRef = useRef();
    const [isClose, setIsClose] = useState(false);
    const [distanceToRef, setDistanceToRef] = useState(null);
    const [bearing, setBearing] = useState(0);

    useEffect(() => {
        let currentBearing = 0;
        let arrowMesh = createArrowMesh(currentBearing);
        const { scene, renderer, cube } = setupThreeJS(mountRef, sceneRef, cubeRef, arrowMesh);

        if (!scene.getObjectByName("arrowMesh")) {
            arrowMesh = createArrowMesh(currentBearing); // Initial bearing of 0
            arrowMesh.name = "arrowMesh";
            scene.add(arrowMesh);
        } else {
            arrowMesh = scene.getObjectByName("arrowMesh");
        }
        const updateArrowDirection = (newBearing) => {
            const newBearingRadians = THREE.MathUtils.degToRad(newBearing);
            arrowMesh.rotation.z = newBearingRadians;
        };

        let watchID = navigator.geolocation.watchPosition(position => {
            const { latitude, longitude } = position.coords;
            const currentDistanceToRef = latLongToMeters(refLatitude, refLongitude, latitude, longitude);
            setDistanceToRef(currentDistanceToRef);

            const proximityThreshold = 10;
            setIsClose(currentDistanceToRef <= proximityThreshold);

            currentBearing = calculateBearing(latitude, longitude, refLatitude, refLongitude);
            setBearing(currentBearing);

            updateArrowDirection(currentBearing);

            if (currentDistanceToRef <= proximityThreshold) {
                if (!scene.children.includes(cube)) {
                    scene.add(cube);
                }
            } else {
                if (scene.children.includes(cube)) {
                    scene.remove(cube);
                }
            }
        }, (err) => {
            console.error(`ERROR(${err.code}): ${err.message}`);
        }, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 27000,
        });

        return () => {
            navigator.geolocation.clearWatch(watchID);
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, [refLatitude, refLongitude]);

    return (
        <div>
            <div ref={mountRef} />
            {distanceToRef !== null && (
                <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
                    {isClose
                        ? `You're close to the reference point! Distance: ${distanceToRef.toFixed(2)} meters`
                        : `You're not close to the reference point. Distance: ${distanceToRef.toFixed(2)} meters`}
                </div>
            )}
        </div>
    );
};

export default GeoLocatedScene;
