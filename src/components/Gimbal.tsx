import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import Gimbal from '../js/Gimbal';
import Arrow from './Arrow';

const GimbalComponent = () => {
    const gimbalRef = useRef(new Gimbal());
    const arrowYawRef = useRef();
    const arrowPitchRef = useRef();
    const arrowRollRef = useRef();
    const arrowAllRef = useRef();

    useEffect(() => {
        gimbalRef.current.enable();

        console.count('GimbalComponent useEffect() called')

        return () => {
            gimbalRef.current.disable();
        };
    }, []);

    useFrame(() => {
        if (gimbalRef.current) {
            // Update arrow rotations based on gimbal values
            arrowYawRef.current.rotation.y = gimbalRef.current.yaw;
            arrowPitchRef.current.rotation.x = gimbalRef.current.pitch;
            arrowRollRef.current.rotation.z = gimbalRef.current.roll;
            arrowAllRef.current.quaternion.copy(gimbalRef.current.quaternion);
        }
    });

    return (
        <>
            <Arrow color="pink" position={[-5, 5, 0]} ref={arrowYawRef} />
            <Arrow color="lime" position={[5, 5, 0]} ref={arrowPitchRef} />
            <Arrow color="cyan" position={[-5, -5, 0]} ref={arrowRollRef} />
            <Arrow color="orange" position={[5, -5, 0]} ref={arrowAllRef} />
        </>
    );
};

export default GimbalComponent;