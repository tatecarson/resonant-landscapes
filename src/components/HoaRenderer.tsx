import React, { useEffect, useState, useContext, useRef } from 'react';
import { AudioContext } from '../contexts/AudioContextProvider';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';

const HOARenderer = () => {
    const audioContext = useContext(AudioContext);

    const [azimuth, setAzimuth] = useState(0);
    const [elevation, setElevation] = useState(0);
    const [gain, setGain] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [order, setOrder] = useState('3rd Order');
    const [sound, setSound] = useState(null);


    const toaRenderer = useRef(null);
    const soaRenderer = useRef(null);
    const inputGain = useRef(null);
    const [soundBuffer, setSoundBuffer] = useState(null);


    const exampleSoundPathList = ['/sounds/HOA3_rec1_01-08ch.ogg', '/sounds/HOA3_rec1_09-16ch.ogg']


    useEffect(() => {
        if (!audioContext) {
            return;
        }
        toaRenderer.current = Omnitone.createHOARenderer(audioContext);
        soaRenderer.current = Omnitone.createHOARenderer(audioContext, { ambisonicOrder: 3 });

        inputGain.current = audioContext.createGain();

        Promise.all([
            Omnitone.createBufferList(audioContext, exampleSoundPathList),
            toaRenderer.current.initialize(),
            soaRenderer.current.initialize()
        ]).then((results) => {
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))
            inputGain.current.connect(soaRenderer.current.input);
            inputGain.current.connect(toaRenderer.current.input);
            soaRenderer.current.output.connect(audioContext.destination);
            toaRenderer.current.output.connect(audioContext.destination);
            soaRenderer.current.setRenderingMode('off');
            setIsPlaying(false);
            setOrder('3rd Order');
        });
    }, [audioContext]);

    const onDirectionChange = () => {
        // Update rotation matrix here
    };

    const onGainSliderChange = () => {
        // Update gain here
    };
    const onTogglePlayback = () => {
        // if (!exampleInitialized) return;


        if (!isPlaying) {

            const currentBufferSource = audioContext.createBufferSource();
            currentBufferSource.buffer = soundBuffer;
            currentBufferSource.loop = true;
            currentBufferSource.connect(inputGain.current);
            currentBufferSource.start();
            setSound(currentBufferSource);
            setIsPlaying(true);
        } else {
            if (sound) {
                sound.stop(0);
            }

            setIsPlaying(false);

        }


    };

    const onToggleAmbisonicOrder = () => {
        // Toggle ambisonic order here
        setOrder(order === '3rd Order' ? '2nd Order' : '3rd Order');
    };

    return (
        <div>
            <h1>Example: HOARenderer</h1>
            <p>HOARenderer is an optimized higher-order ambisonic renderer...</p>
            <div id="secSource">
                <p>NOTE: Use headphones for the full-sphere surround sound.</p>
                <h2>Orient the head by selecting the horizontal and vertical controls.</h2>
                <dl>
                    <dt>Azimuth = <span>{azimuth}</span></dt>
                    <dd><input type="range" min="-180" max="180" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} /></dd>
                    <dt>Elevation = <span>{elevation}</span></dt>
                    <dd><input type="range" min="-90" max="90" value={elevation} onChange={(e) => setElevation(e.target.value)} /></dd>
                    <dt>Gain (dB) = <span>{gain}</span></dt>
                    <dd><input type="range" min="-60" max="24" value={gain} onChange={(e) => setGain(e.target.value)} /></dd>
                </dl>
                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
                <button onClick={onToggleAmbisonicOrder}>{order}</button>
            </div>
            <div id="footer">
                <p>Found something broken? <a href="https://github.com/GoogleChrome/omnitone/issues">File an issue.</a></p>
            </div>
        </div>
    );
}

export default HOARenderer;