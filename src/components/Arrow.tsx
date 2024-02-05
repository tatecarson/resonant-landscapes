import React from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const Arrow = React.forwardRef(({ color, position }, ref) => {
    const arrowGeom = new THREE.CylinderGeometry(0.05, 0.2, 1, 12);
    const arrowMat = new THREE.MeshLambertMaterial({ color });
    const mesh = <mesh geometry={arrowGeom} material={arrowMat} position={position} ref={ref} />;
    return mesh;
});

export default Arrow;
