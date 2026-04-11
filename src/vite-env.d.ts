/// <reference types="vite/client" />

// Type for iOS-specific static requestPermission on DeviceOrientationEvent
type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

// Declare Omnitone module (no bundled types)
declare module 'omnitone/build/omnitone.min.esm.js' {
  const Omnitone: {
    createBufferList(context: AudioContext, urls: string[]): Promise<AudioBuffer[]>;
    mergeBufferListByChannel(context: AudioContext, buffers: AudioBuffer[]): AudioBuffer;
  };
  export default Omnitone;
}

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
    activeUrls: string[];
    cacheEntries: number;
    lastLoadReason: "active-load" | "prefetch" | null;
    lastLoadDurationMs: number | null;
    lastLoadCacheHit: boolean | null;
  };
  __renderDebug?: Record<string, {
    renderCount: number;
    changedKeys: string[];
    lastRenderedAt: number;
  }>;
}
