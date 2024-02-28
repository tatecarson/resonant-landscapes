import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Flex, Box } from '@react-three/flex';
import * as THREE from 'three';
// import useGimbalStore from '../stores/gimbalStore';
import Gimbal from '../js/Gimbal';
import 'tailwindcss/tailwind.css';

const GimbalArrow = () => {
    const [gimbal] = useState(new Gimbal());
    const arrowAll = useRef();
    const [permissionGranted, setPermissionGranted] = useState(false);

    // const setForwardStore = useGimbalStore((state) => state.setForward);
    // const setUpStore = useGimbalStore((state) => state.setUp);

    // Handle device orientation permission request
    const requestPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    setPermissionGranted(true);
                }
            } catch (error) {
                console.error("DeviceOrientationEvent.requestPermission error:", error);
            }
        } else {
            // Automatically grant permission if the browser does not support requestPermission
            setPermissionGranted(true);
        }
    }, []);

    useEffect(() => {
        gimbal.enable();
        gimbal.recalibrate();

        return () => {
            gimbal.disable();
        };
    }, [gimbal]);

    useEffect(() => {
        if (!permissionGranted) {
            return;
        }

        const renderLoop = () => {
            gimbal.update();
            // setForwardStore(gimbal.vectorFwd.x, gimbal.vectorFwd.z, gimbal.vectorFwd.z);
            // setUpStore(gimbal.vectorUp.x, gimbal.vectorUp.y, gimbal.vectorUp.z);

            if (arrowAll.current) {
                arrowAll.current.quaternion.copy(gimbal.quaternion);
            }

            requestAnimationFrame(renderLoop);
        };

        renderLoop();
    }, [permissionGranted, gimbal]);

    const makeArrowMesh = useCallback((color) => {
        const shape = new THREE.Shape();
        shape.moveTo(1, -2);
        shape.lineTo(1, 0);
        shape.lineTo(2, 0);
        shape.lineTo(0, 2);
        shape.lineTo(-2, 0);
        shape.lineTo(-1, 0);
        shape.lineTo(-1, -2);
        shape.lineTo(1, -2);

        const extrudeSettings = { steps: 1, depth: 1, bevelEnabled: false };
        const arrowGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        return <mesh geometry={arrowGeom} material={new THREE.MeshLambertMaterial({ color })} />;
    }, []);

    if (!permissionGranted) {
        return (
            <div className="flex justify-center items-center h-screen">
                <button className="p-4 bg-blue-500 text-white rounded" onClick={requestPermission}>
                    Allow Orientation Access
                </button>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            {gimbal && (
                <Canvas
                    onCreated={({ gl, camera }) => {
                        camera.updateProjectionMatrix();
                        gl.setSize(window.innerWidth, window.innerHeight);
                    }}
                    camera={{ position: [0, 0, 10], aspect: window.innerWidth / window.innerHeight, zoom: 20 }} orthographic={true} style={{ background: '#f0f0f0' }}>
                    <ambientLight intensity={0.1} position={[0.5, -1, 1]} />
                    <directionalLight color="#ffffff" position={[0, 0, 5]} />
                    <Flex alignItems="center" justifyContent="center">
                        <Box centerAnchor>
                            <group position={[0, 0, 0]} ref={arrowAll}>{makeArrowMesh(0xff9900)}</group>
                        </Box>
                    </Flex>
                </Canvas>
            )}
            <div
                className="absolute bottom-0 right-0 w-1/2 bg-gray-800 text-center py-2 font-bold text-white cursor-pointer hover:bg-gray-700"
                onClick={() => gimbal.recalibrate()}>
                Recalibrate
            </div>
        </div>
    );
};

export default GimbalArrow;
