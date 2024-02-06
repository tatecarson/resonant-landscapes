import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Flex, Box } from '@react-three/flex';
import { OrthographicCamera, Resize } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowHelper, Vector3 } from 'three';
import Gimbal from '../js/Gimbal';
import 'tailwindcss/tailwind.css';

const DEG = 180 / Math.PI;


const GimbalTest = () => {
    const [gimbal] = useState(new Gimbal());
    const [yaw, setYaw] = useState(0);
    const [pitch, setPitch] = useState(0);
    const [roll, setRoll] = useState(0);
    const arrowYaw = useRef();
    const arrowPitch = useRef();
    const arrowRoll = useRef();
    const arrowAll = useRef();


    const [buttonClicked, setButtonClicked] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            // Implement resize logic if necessary
        };

        window.addEventListener('resize', handleResize);

        // Optional: Implement device permission request logic for gyroscope

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        const renderLoop = () => {
            gimbal.update();

            // Update state with gimbal values
            setYaw(gimbal.yaw * DEG);
            setPitch(gimbal.pitch * DEG);
            setRoll(gimbal.roll * DEG);

            // Update arrow quaternions or rotations
            if (arrowYaw.current) {
                arrowYaw.current.rotation.y = gimbal.yaw;
            }
            if (arrowPitch.current) {
                arrowPitch.current.rotation.x = gimbal.pitch;
            }
            if (arrowRoll.current) {
                arrowRoll.current.rotation.z = gimbal.roll;
            }
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


        console.log('makeArrowMesh')
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
                        camera={{ position: [0, 0, 10], aspect: window.innerWidth / window.innerHeight, zoom: 15 }} orthographic={true} style={{ background: '#f0f0f0' }}  >

                        <ambientLight intensity={0.1} position={[0.5, -1, 1]} />
                        <directionalLight color="#ffffff" position={[0, 0, 5]} />

                        <Flex
                            alignItems="center" // Align items in the cross axis
                            justifyContent="center" // Align items in the main axis
                        >

                            <Box centerAnchor>
                                <group position={[-5, 5, 0]} ref={arrowYaw}>{makeArrowMesh(0xff0099)}</group>
                            </Box>
                            <Box centerAnchor>
                                <group position={[5, 5, 0]} ref={arrowPitch}>{makeArrowMesh(0x99ff00)}</group>
                            </Box>
                            <Box centerAnchor>
                                <group position={[-5, -5, 0]} ref={arrowRoll}>{makeArrowMesh(0x0099ff)}</group>
                            </Box>
                            <Box centerAnchor>
                                <group position={[5, -5, 0]} ref={arrowAll}>{makeArrowMesh(0xff9900)}</group>
                            </Box>

                        </Flex>

                    </Canvas>
                    <div className="absolute bottom-0 left-0 w-1/2 h-1/2 border border-dashed border-gray-600 p-2">
                        <div className="text-lg font-bold">Yaw</div>
                        <div className="mt-4">{yaw.toFixed(1)}°</div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-1/2 h-1/2 border border-dashed border-gray-600 p-2">
                        <div className="text-lg font-bold">Pitch</div>
                        <div className="mt-4">{pitch.toFixed(1)}°</div>
                    </div>
                    <div className="absolute bottom-1/2 left-0 w-1/2 h-1/2 border border-dashed border-gray-600 p-2">
                        <div className="text-lg font-bold">Roll</div>
                        <div className="mt-4">{roll.toFixed(1)}°</div>
                    </div>
                    <div className="absolute bottom-1/2 right-0 w-1/2 h-1/2 border border-dashed border-gray-600 p-2">
                    </div>
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
