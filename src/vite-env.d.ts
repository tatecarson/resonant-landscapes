/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tate's GoatCounter site code; unset means counting is off entirely. */
  readonly VITE_GOATCOUNTER_SITE?: string;
}

// Type for iOS-specific static requestPermission on DeviceOrientationEvent
type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

interface Window {
  /**
   * GoatCounter's counting script, present only when the build has a site
   * code and the script has loaded. See src/analytics/goatcounter.ts.
   */
  goatcounter?: {
    count: (options?: { path?: string; event?: boolean; title?: string }) => void;
  };
  __gimbalOrientation?: {
    fwdX: number; fwdY: number; fwdZ: number;
    upX: number; upY: number; upZ: number;
    updatedAt: number;
  };
  __audioDebug?: {
    contextState: string;
    isEngineInitializing: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    isAudioUnlocked: boolean;
    hasBuffers: boolean;
    bufferDuration: number | null;
    bufferChannels: number | null;
    hasSourceNode: boolean;
    engineError: string | null;
    loadError: string | null;
    lastUnlockError: string | null;
    needsAudioResume: boolean;
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
  /** Live view zoom, mirrored every frame under debug. */
  __mapZoom?: number | null;
  /**
   * The zoom bounds OpenLayers actually applied, which are not the ones asked
   * for: it floors the span between them. Mirrored so a test can assert the
   * real stops rather than the requested ones. See MAX_ZOOM in geofence.ts.
   */
  __mapZoomBounds?: { minZoom: number; maxZoom: number } | null;
  __mapDebug?: {
    center: [number, number] | null;
    position: [number, number];
    rotation: number;
    centerOnUser: boolean;
    markerPixel: [number, number] | null;
    viewportSize: [number, number] | null;
  };
}
