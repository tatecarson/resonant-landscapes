/**
 * Window properties that only exist because a spec injects them (via
 * page.addInitScript or page.evaluate). Declaring them here keeps the specs
 * type-checked under tsconfig.test.json without loosening src types.
 */
interface Window {
  __dispatchDeviceOrientation?: (alpha: number, beta: number, gamma: number) => void;
  __gimbalPreviewLoopId?: number;
  __iosPermissionHarness?: {
    motionPermissionCalls: number;
    motionPermissionCallsDuringGesture: number;
    motionPermissionCallsOutsideGesture: number;
    calls: Array<{ hadGesture: boolean; gestureType: string | null; ts: number }>;
  };
}
