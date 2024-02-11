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

    // const bearingRadians = THREE.MathUtils.degToRad(bearing);
    // mesh.rotation.y = bearingRadians; // Rotate the arrow to point in the bearing direction

    return mesh;
}


const GeoLocatedScene = ({ refLatitude, refLongitude }) => {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const rendererRef = useRef(null);
    const cameraRef = useRef(null);
    const [isClose, setIsClose] = useState(false);
    const [distanceToRef, setDistanceToRef] = useState(null);
    const [bearing, setBearing] = useState(0);
    const [alpha, setAlpha] = useState(null);
    const arrowMeshRef = useRef(null);

    const [currentLatitude, setCurrentLatitude] = useState();
    const [currentLongitude, setCurrentLongitude] = useState();

    useEffect(() => {
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        cameraRef.current = camera;
        cameraRef.current.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        rendererRef.current = renderer;
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);

        const initialArrowMesh = createArrowMesh(bearing);
        sceneRef.current.add(initialArrowMesh);
        arrowMeshRef.current = initialArrowMesh; // Store arrow mesh in state for later updates

    }, [bearing]);

    useEffect(() => {
        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);

            if (arrowMeshRef.current && alpha !== null) {
                // Combine device orientation with geolocation bearing
                // Note: You might need to adjust this calculation depending on your exact requirements
                const deviceOrientation = alpha;
                const totalBearing = (bearing - deviceOrientation + 360) % 360;
                const bearingRadians = THREE.MathUtils.degToRad(totalBearing);

                arrowMeshRef.current.rotation.z = bearingRadians;
            }

            rendererRef.current.render(sceneRef.current, cameraRef.current);
        };
        animate();

    }, [bearing, alpha]);

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

        return () => {
            navigator.geolocation.clearWatch(watchID);
            if (mountRef.current && rendererRef.current.domElement) {
                mountRef.current.removeChild(rendererRef.current.domElement);
            }
        };
    }, [currentLatitude, currentLongitude])


    useEffect(() => {
        if (currentLatitude && currentLongitude) {
            const refPoint = turf.point([refLongitude, refLatitude]);
            const currentPoint = turf.point([currentLongitude, currentLatitude]);
            const options = { units: 'meters' };
            const distance = turf.distance(refPoint, currentPoint, options);
            const bearing = turf.bearing(refPoint, currentPoint);

            setDistanceToRef(distance);
            setBearing(bearing);

            if (distance < 2) {

                sceneRef.current.remove(arrowMeshRef.current);
                setIsClose(true);

                // change background color of canvas
                rendererRef.current.setClearColor(0x00ff00); // Green color
            } else {
                sceneRef.current.add(arrowMeshRef.current);
                setIsClose(false);

                // change background color of canvas
                // FIXME: this isn't turning the background black, or it blinks back and forth 
                rendererRef.current.setClearColor(0x000000); // Black color
            }
        }
    }, [currentLatitude, currentLongitude, refLatitude, refLongitude, rendererRef.current, sceneRef.current]);


    // Define handleOrientation function
    const handleOrientation = useCallback((event) => {
        const { alpha } = event; // Device's compass heading

        setAlpha(alpha);

        // console.log(alphaRef.current, 'degrees')

    }, [arrowMeshRef.current]);

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
                            
                            Bearing: ${bearing.toFixed(2)} degrees. 
                            
                            Alpha: ${alpha !== null ? alpha.toFixed(2) : 'N/A'}
                            
                            arrowMeshRef.current.rotation.z: ${arrowMeshRef.current ? arrowMeshRef.current.rotation.z.toFixed(2) : 'N/A'}  
                            `

                    }

                </div>
            )}
        </div>
    );
};

export default GeoLocatedScene;
