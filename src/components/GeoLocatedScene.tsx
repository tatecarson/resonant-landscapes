import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
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


const GeoLocatedScene = ({ refLatitude, refLongitude }) => {
    const mountRef = useRef(null);
    const [isClose, setIsClose] = useState(false);
    const [distanceToRef, setDistanceToRef] = useState(null);
    const [bearing, setBearing] = useState(0);
    const alphaRef = useRef(null);
    const arrowMeshRef = useRef(null);

    useEffect(() => {

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        const initialArrowMesh = createArrowMesh(0);
        scene.add(initialArrowMesh);
        arrowMeshRef.current = initialArrowMesh; // Store arrow mesh in state for later updates


        // FIXME: It "sort of works" - do some more testing 
        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);

            if (arrowMeshRef.current && alphaRef.current !== null) {
                // Combine device orientation with geolocation bearing
                // Note: You might need to adjust this calculation depending on your exact requirements
                const deviceOrientation = alphaRef.current;
                const totalBearing = (bearing - deviceOrientation + 360) % 360;
                const bearingRadians = THREE.MathUtils.degToRad(totalBearing);

                // Assuming you want to rotate around Z to adjust for compass heading
                arrowMeshRef.current.rotation.z = bearingRadians;
            }


            renderer.render(scene, camera);
        };
        animate();



        const watchID = navigator.geolocation.watchPosition(position => {
            const { latitude, longitude } = position.coords;

            // Turf.js to calculate distance and bearing
            const from = turf.point([refLongitude, refLatitude]);
            const to = turf.point([longitude, latitude]);
            const options = { units: 'meters' };

            const distance = turf.distance(from, to, options);
            setDistanceToRef(distance);

            console.log('Distance to ref:', distance, 'meters')

            const bearingToRef = turf.bearing(from, to);

            setBearing(bearingToRef);

            if (distance < 2) {

                scene.remove(arrowMeshRef.current);
                setIsClose(true);

                // change background color of canvas
                renderer.setClearColor(0x00ff00); // Green color
            } else {
                scene.add(arrowMeshRef.current);
                setIsClose(false);

                // change background color of canvas
                renderer.setClearColor(0x000000); // Black color
            }

        }, error => console.error(`ERROR(${error.code}): ${error.message}`), {
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

    // Define handleOrientation function
    const handleOrientation = useCallback((event) => {
        const { alpha } = event; // Device's compass heading

        alphaRef.current = alpha;

    }, [bearing, arrowMeshRef.current]);

    // Request device orientation permission and set up event listener
    const requestGyroPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation, true);
            } else {
                console.log('Gyroscope permission not granted');
            }
        } else {
            // Automatically set up the event listener for browsers that do not require permission
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
    }, [handleOrientation]);

    return (
        <div>
            <button onClick={() => requestGyroPermission()}>Enable Orientation</button>
            <div ref={mountRef} />
            {/* {isClose} */}
            {distanceToRef !== null && (
                <div style={{ position: 'absolute', top: '30px', left: '10px', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px' }}>
                    {isClose
                        ? `You're close to the reference point! Distance: ${distanceToRef.toFixed(2)} meters`
                        : `You're not close to the reference point. Distance: ${distanceToRef.toFixed(2)} meters. 
                            Bearing: ${bearing.toFixed(2)} degrees.`}
                </div>
            )}
        </div>
    );
};

export default GeoLocatedScene;
