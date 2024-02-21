import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import * as THREEx from '../../js/unused/ar-threex-location-only.js/index.js';

const ARScene = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current });

        const arjs = new THREEx.LocationBased(scene, camera);
        const cam = new THREEx.WebcamRenderer(renderer);

        const geom = new THREE.BoxGeometry(20, 20, 20);
        const mtl = new THREE.MeshBasicMaterial();
        const box = new THREE.Mesh(geom, mtl);

        // Example coordinates, change these to your desired location
        arjs.add(box, -0.72, 51.051);

        // Start the GPS
        arjs.startGps();

        const render = () => {
            if (canvasRef.current.width !== canvasRef.current.clientWidth || canvasRef.current.height !== canvasRef.current.clientHeight) {
                renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight, false);
                camera.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
                camera.updateProjectionMatrix();
            }
            cam.update();
            renderer.render(scene, camera);
            requestAnimationFrame(render);
        };

        render();

        // Cleanup function
        return () => {
            // Perform any cleanup operations here
            renderer.dispose(); // Example cleanup operation
        };
    }, []);

    return <canvas ref={canvasRef} id="canvas1" style={{ width: '100%', height: '100%' }}></canvas>;
};

export default ARScene;
