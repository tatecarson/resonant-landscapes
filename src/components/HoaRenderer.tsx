import React, { useEffect, useState, useContext, useRef, memo, useCallback, Suspense } from 'react';
// import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';

const HOARenderer = () => {
    const { audioContext, resonanceAudioScene, playSound, stopSound, loadBuffers, isLoading, isPlaying, buffers } = useAudioContext();


    const [forward, setForward] = useState({ x: 0, y: 0, z: 0 });
    const [up, setUp] = useState({ x: 0, y: 0, z: 0 });

    // Effect to load buffers on component mount

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    useEffect(() => {
        async function load() {
            if (audioContext && buffers.length === 0) {
                await loadBuffers(exampleSoundPathList);
            }
        }
        load();
    }, [audioContext, buffers.length, loadBuffers]); // Ensure dependencies are correctly listed


    // Cleanup effect
    useEffect(() => {
        return () => {
            console.log('Cleanup on unmount');
            // Cleanup logic here, if any
            if (isPlaying) {
                stopSound();
            }
        };
    }, []);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            stopSound();
        } else {
            playSound(buffers[0]);
        }
    }, [buffers, playSound, stopSound]);


    const handleSetForward = useCallback((vector) => {
        // console.log(vector)
        setForward(vector);
    }, []);

    const handleSetUp = useCallback((vector) => {
        setUp(vector);
    }, []);

    useEffect(() => {
        console.log("isPlaying", isPlaying)
        if (resonanceAudioScene && isPlaying && !isLoading) {
            console.log('Setting listener orientation');
            // FIXME: hmm somethign about this is breaking the app
            // resonanceAudioScene.setListenerOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
    }, [forward, up, isPlaying])


    return (
        <div id="secSource">
            {isLoading ? (
                <div>Loading...</div>
            ) : (
                <>
                    <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
                    <GimbalArrow setForward={handleSetForward} setUp={handleSetUp} />
                </>
            )}
        </div>
    );
}

export default HOARenderer;