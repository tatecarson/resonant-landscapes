import { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Flex, Box } from '@react-three/flex';
import * as THREE from 'three';
import useGimbalStore from '../stores/gimbalStore';
import Gimbal from '../js/Gimbal';
import 'tailwindcss/tailwind.css';

// FIXME: something weird is happening where when the gyroscope permission is requested
// the page reloads
const GimbalTest = () => {
    const [gimbal] = useState(new Gimbal());
    const arrowAll = useRef();

    const [buttonClicked, setButtonClicked] = useState(false);
    const setForwardStore = useGimbalStore((state) => state.setForward);
    const setUpStore = useGimbalStore((state) => state.setUp);

    useEffect(() => {
        const renderLoop = () => {
            gimbal.update();

            // set global state with gimbal values
            setForwardStore(gimbal.vectorFwd.x, gimbal.vectorFwd.z, gimbal.vectorFwd.z);
            setUpStore(gimbal.vectorUp.x, gimbal.vectorUp.y, gimbal.vectorUp.z);

            if (arrowAll.current) {
                arrowAll.current.quaternion.copy(gimbal.quaternion);
            }

            requestAnimationFrame(renderLoop);
        };

        renderLoop();
    }, [gimbal]);

    const requestGyroPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                gimbal.enable()
            } else {
                console.log('Gyroscope permission not granted');
            }
        } else {
            // For non iOS 13+ devices
        }
    }, [gimbal]);

    // Function to create arrow mesh (adapted from makeArrowMesh)
    const makeArrowMesh = (color) => {

        const shape = new THREE.Shape();
        // Define the arrowhead (a triangle)
        shape.moveTo(1, -2);
        shape.lineTo(1, 0);
        shape.lineTo(2, 0);
        shape.lineTo(0, 2);
        shape.lineTo(-2, 0);
        shape.lineTo(-1, 0);
        shape.lineTo(-1, -2);
        shape.lineTo(1, -2);

        const extrudeSettings = {
            steps: 1,
            depth: 1,
            bevelEnabled: false,
        };
        const arrowGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        return <mesh geometry={arrowGeom} material={new THREE.MeshLambertMaterial({ color })} />;
    };

    return (
        <div className="relative w-full h-full">

            {!buttonClicked ? (
                <button
                    className="absolute top-0 left-0 m-4 py-2 px-4 bg-blue-500 text-white font-bold rounded hover:bg-blue-700 focus:outline-none"
                    onClick={() => {
                        requestGyroPermission();
                        setButtonClicked(true);
                    }}
                >
                    Request Gyroscope Permission
                </button>
            ) : (
                <>
                    <Canvas
                        onCreated={({ gl, camera }) => {
                            camera.updateProjectionMatrix();
                            gl.setSize(window.innerWidth, window.innerHeight);
                        }}
                        camera={{ position: [0, 0, 10], aspect: window.innerWidth / window.innerHeight, zoom: 20 }} orthographic={true} style={{ background: '#f0f0f0' }}  >

                        <ambientLight intensity={0.1} position={[0.5, -1, 1]} />
                        <directionalLight color="#ffffff" position={[0, 0, 5]} />

                        <Flex
                            alignItems="center" // Align items in the cross axis
                            justifyContent="center" // Align items in the main axis
                        >
                            <Box centerAnchor>
                                <group position={[0, 0, 0]} ref={arrowAll}>{makeArrowMesh(0xff9900)}</group>
                            </Box>

                        </Flex>

                    </Canvas>

                    <div
                        className="absolute bottom-0 right-0 w-1/2 bg-gray-800 text-center py-2 font-bold text-white cursor-pointer hover:bg-gray-700"
                        onClick={() => gimbal.recalibrate()}>
                        Recalibrate
                    </div>

                </>
            )}
        </div>
    );
}

export default GimbalTest;
