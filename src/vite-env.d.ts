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
  __gimbalOrientation?: {
    fwdX: number; fwdY: number; fwdZ: number;
    upX: number; upY: number; upZ: number;
    updatedAt: number;
  };
  __audioDebug?: {
    contextState: string;
    isLoading: boolean;
    isPlaying: boolean;
    isAudioUnlocked: boolean;
    hasBuffers: boolean;
    bufferDuration: number | null;
    bufferChannels: number | null;
    hasSourceNode: boolean;
    loadError: string | null;
    lastUnlockError: string | null;
    lastEvent: string | null;
    activeUrls: string[];
    cacheEntries: number;
    lastLoadReason: "active-load" | "prefetch" | null;
    lastLoadDurationMs: number | null;
    lastLoadCacheHit: boolean | null;
    uiStatus?: string | null;
  };
  __renderDebug?: Record<string, {
    renderCount: number;
    changedKeys: string[];
    lastRenderedAt: number;
  }>;
  __mapDebug?: {
    center: [number, number] | null;
    position: [number, number];
    rotation: number;
    centerOnUser: boolean;
    markerPixel: [number, number] | null;
    viewportSize: [number, number] | null;
  };
}
