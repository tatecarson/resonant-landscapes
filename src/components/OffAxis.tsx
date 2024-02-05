import React, { useRef, useMemo, createRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Box, Plane, Html } from '@react-three/drei'
import { DeviceOrientationControls } from '@react-three/drei'

import { vertexShader, fragmentShader } from './shaders'
import Blob from './Blob'

import './styles.css'

const rotation = createRef()

const SetPixelRatio = ({ pixelRatio }) => {
    const { gl } = useThree();
    gl.setPixelRatio(pixelRatio);
    return null;
};

function DepthCube() {
    const { aspect } = useThree()

    const args = useMemo(() => {
        return {
            vertexShader,
            fragmentShader
        }
    }, [])

    const { width, height } = useMemo(
        () =>
            aspect > 1
                ? {
                    width: 1,
                    height: 1 / aspect
                }
                : {
                    width: aspect,
                    height: 1
                },

        [aspect]
    )

    return (
        <>
            <Box>
                <shaderMaterial attach="material" args={[args]} transparent side={THREE.BackSide} />
                <group scale={[0.1 / width, 0.1 / height, 0.1]}>
                    <Blob color="#9a1be1" position={[1.5, 2, 2]} factor={0.75} />
                    <Blob color="#e19a1b" position={[-1.5, 0, 0]} factor={1} />
                    <Blob color="#1be19a" position={[1.5, -2.5, -2]} factor={1.25} />
                </group>
            </Box>

            <ambientLight intensity={0.3} />
            <pointLight intensity={1} position={[10, 10, 10]} />
        </>
    )
}

function PlanePortal() {
    const cam = useRef()
    const planeRef = useRef()

    const { near, scene, target, portalHalfWidth, portalHalfHeight } = useMemo(() => {
        const target = new THREE.WebGLRenderTarget(1024, 1024)
        const scene = new THREE.Scene()

        scene.fog = new THREE.Fog(0x000000, 0.1, 1.5)
        scene.background = new THREE.Color('black')

        const near = 0.1
        const portalHalfWidth = 1 / 2
        const portalHalfHeight = 1 / 2

        return { near, scene, target, portalHalfWidth, portalHalfHeight }
    }, [])

    useFrame((state) => {
        cam.current.position.copy(state.camera.position)
        cam.current.quaternion.copy(planeRef.current.quaternion)

        const portalPosition = new THREE.Vector3().copy(planeRef.current.position)

        cam.current.updateMatrixWorld()
        cam.current.worldToLocal(portalPosition)

        const left = portalPosition.x - portalHalfWidth
        const right = portalPosition.x + portalHalfWidth
        const top = portalPosition.y + portalHalfHeight
        const bottom = portalPosition.y - portalHalfHeight

        const distance = Math.abs(portalPosition.z)
        const scale = near / distance

        const scaledLeft = left * scale
        const scaledRight = right * scale
        const scaledTop = top * scale
        const scaledBottom = bottom * scale

        cam.current.projectionMatrix.makePerspective(scaledLeft, scaledRight, scaledTop, scaledBottom, near, 10)

        state.gl.render(scene, cam.current)
    }, 1)

    return (
        <>
            <PerspectiveCamera ref={cam} />
            {createPortal(<DepthCube />, scene)}
            <Plane ref={planeRef}>
                <meshStandardMaterial attach="material" map={target.texture} />
            </Plane>
        </>
    )
}

function InteractionManager(props) {
    const { isMobile } = props

    const [clicked, setClicked] = useState(false)

    console.log(clicked)
    const handleClick = useCallback(
        function handleClick() {
            setClicked(true)
            // rotation.current = new DeviceOrientationControls(new THREE.PerspectiveCamera())
        },
        [setClicked]
    )

    useFrame(({ camera }) => {
        if (!rotation.current) return

        rotation.current.update()

        if (!rotation.current?.deviceOrientation) return

        const { beta, gamma } = rotation.current.deviceOrientation

        if (!beta || !gamma) return

        camera.lookAt(0, 0, 0)

        camera.position.x = -gamma / 90
        camera.position.y = beta / 90
        camera.position.z = 1 - 0.5 * Math.min(Math.abs(camera.position.x) + Math.abs(camera.position.y), 1)
    })

    return clicked ? (
        <>
            <PlanePortal />
            <Plane material-transparent material-opacity={0} onClick={handleClick}>
                {!isMobile && (
                    <Html center scaleFactor={8}>
                        <div style={{ color: 'white', fontFamily: 'Fredoka One' }}>Try it on mobile!</div>
                    </Html>
                )}
            </Plane>
        </>
    ) : (
        <Plane material-transparent material-opacity={0} onClick={handleClick}>
            <Html center scaleFactor={10}>
                <div style={{ color: 'black', fontFamily: 'Fredoka One' }}>Click Here</div>
            </Html>
        </Plane>
    )
}

const OffAxis = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const pixelRatio = Math.min(2, isMobile ? window.devicePixelRatio : 1);
    const [permissionGranted, setPermissionGranted] = useState(false);

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
        <div>
            {!permissionGranted ? (
                <button onClick={requestPermission}>Request Permission</button>
            ) : (
                <Canvas
                    camera={{ position: [0, 0, 1], far: 100, near: 0.1 }}>
                    <SetPixelRatio pixelRatio={pixelRatio} />
                    <InteractionManager isMobile={isMobile} />
                    <DeviceOrientationControls />
                </Canvas>
            )}
        </div>
    )
}

export default OffAxis;