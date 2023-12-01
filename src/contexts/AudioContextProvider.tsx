// src/contexts/AudioContextProvider.tsx

import React, { createContext, useState, useEffect } from 'react';

// Creating the context
export const AudioContext = createContext(null);

const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);

    useEffect(() => {
        // Initialize AudioContext when the component mounts
        const context = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(context);

        // Clean up when the component unmounts
        return () => {
            context.close();
        };
    }, []);

    return (
        <AudioContext.Provider value={audioContext} >
            {children}
        </AudioContext.Provider>
    );
};

export default AudioContextProvider;
