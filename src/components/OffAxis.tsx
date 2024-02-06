import React, { useRef, useMemo, createRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { DeviceOrientationControls, OrthographicCamera } from '@react-three/drei'

const SetPixelRatio = ({ pixelRatio }) => {
    const { gl } = useThree();
    gl.setPixelRatio(pixelRatio);
    return null;
};

function Arrow() {
    const { scene } = useThree();

    useEffect(() => {
        // Create an arrow
        const dir = new THREE.Vector3(1, 0, 0); // Direction of the arrow
        const origin = new THREE.Vector3(0, 0, 0); // Starting point of the arrow
        const length = 150; // Length of the arrow
        const color = new THREE.Color(0xff0000); // Color of the arrow

        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, color);

        // Add the arrow to the scene
        scene.add(arrowHelper);

        // Remove the arrow when the component is unmounted
        return () => {
            scene.remove(arrowHelper);
        };
    }, [scene]);

    return null;
}


function InteractionManager(props) {
    const { isMobile, camera } = props


    useFrame(() => {

        // FIXME: this returns nothing
        if (camera.current) {
            console.log(camera.current)
            console.log(camera.current.rotation);
        }
        // camera.lookAt(0, 0, 0)
    })

    return (

        <Arrow />

    )
}

const OffAxis = () => {
    const [permissionGranted, setPermissionGranted] = useState(false);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const pixelRatio = Math.min(2, isMobile ? window.devicePixelRatio : 1);
    const cameraRef = useRef();

    const requestPermission = async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();

            if (permission === 'granted') {
                setPermissionGranted(true);
            }
        } else {
            // If DeviceOrientationEvent.requestPermission is not a function, the browser
            // probably doesn't require permission to use device orientation.
            setPermissionGranted(true);
        }
    };


    return (
        <div style={{ height: '100vh', width: '100vw' }}>
            <button onClick={requestPermission}>Request Permission</button>

            <Canvas style={{ background: 'gray', width: '100%', height: '100%' }}>
                <OrthographicCamera makeDefault position={[0, 0, 10]} ref={cameraRef} />

                <SetPixelRatio pixelRatio={pixelRatio} />
                {permissionGranted && <InteractionManager isMobile={isMobile} camera={cameraRef.current} />}
                {permissionGranted &&
                    <DeviceOrientationControls camera={cameraRef.current} />
                }

            </Canvas>
        </div>
    )
}

export default OffAxis;