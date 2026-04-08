/// <reference types="vite/client" />

interface Window {
  __audioDebug?: {
    contextState: string;
    isLoading: boolean;
    isPlaying: boolean;
    hasBuffers: boolean;
    bufferDuration: number | null;
    bufferChannels: number | null;
    hasSourceNode: boolean;
    loadError: string | null;
    lastEvent: string | null;
  };
}
