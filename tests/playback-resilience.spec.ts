import { expect, test } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

const sicaHollowCenter = {
  latitude: 44.013364,
  longitude: -97.110649,
};

test("mobile playback holds a wake lock and recovers after audio interruption", async ({
  page,
}, testInfo) => {
  test.skip(
    !["iphone-13", "pixel-7"].includes(testInfo.project.name),
    "This test covers mobile playback lifecycle behavior."
  );

  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __playbackLifecycleTest?: {
        wakeLockRequests: number;
        wakeLockReleases: number;
        audioContext: AudioContext | null;
        originalResume: (() => Promise<void>) | null;
      };
    };
    testWindow.__playbackLifecycleTest = {
      wakeLockRequests: 0,
      wakeLockReleases: 0,
      audioContext: null,
      originalResume: null,
    };

    class TestWakeLockSentinel extends EventTarget {
      released = false;

      async release() {
        if (this.released) return;
        this.released = true;
        testWindow.__playbackLifecycleTest!.wakeLockReleases += 1;
        this.dispatchEvent(new Event("release"));
      }
    }

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          testWindow.__playbackLifecycleTest!.wakeLockRequests += 1;
          return new TestWakeLockSentinel();
        },
      },
    });

    const OriginalAudioContext = window.AudioContext;
    class TrackingAudioContext extends OriginalAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        testWindow.__playbackLifecycleTest!.audioContext = this;
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: TrackingAudioContext,
    });
  });

  await seedOrientationPermission(page);

  await page.goto(
    `/?mock=${sicaHollowCenter.latitude},${sicaHollowCenter.longitude}&ntl-drawer-state=hidden`
  );
  await page.waitForLoadState("domcontentloaded");
  await dismissWelcomeModal(page);

  await expect.poll(async () => page.evaluate(() => window.__audioDebug), {
    timeout: 20_000,
  }).toMatchObject({
    isPlaying: true,
    needsAudioResume: false,
    uiStatus: "playing",
  });
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __playbackLifecycleTest?: { wakeLockRequests: number } })
      .__playbackLifecycleTest?.wakeLockRequests ?? 0
  ))).toBe(1);

  await page.getByRole("button", { name: "Open field guide" }).click();
  const wakeLockSwitch = page.getByRole("switch", {
    name: "Keep screen awake while audio plays",
  });
  await expect(wakeLockSwitch).toBeChecked();
  await wakeLockSwitch.click();
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __playbackLifecycleTest?: { wakeLockReleases: number } })
      .__playbackLifecycleTest?.wakeLockReleases ?? 0
  ))).toBe(1);

  await wakeLockSwitch.click();
  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __playbackLifecycleTest?: { wakeLockRequests: number } })
      .__playbackLifecycleTest?.wakeLockRequests ?? 0
  ))).toBe(2);
  await page.getByRole("button", { name: "Close" }).click();

  await page.evaluate(async () => {
    const testState = (window as Window & {
      __playbackLifecycleTest?: {
        audioContext: AudioContext | null;
        originalResume: (() => Promise<void>) | null;
      };
    }).__playbackLifecycleTest;
    const audioContext = testState?.audioContext;
    if (!audioContext || !testState) {
      throw new Error("The test AudioContext was not captured.");
    }

    testState.originalResume = audioContext.resume.bind(audioContext);
    Object.defineProperty(audioContext, "resume", {
      configurable: true,
      value: async () => {
        throw new DOMException("A user gesture is required", "NotAllowedError");
      },
    });
    await audioContext.suspend();
  });

  const resumeButton = page.getByRole("button", {
    name: "Resume audio after interruption",
  });
  await expect(resumeButton).toBeVisible();

  await page.evaluate(() => {
    const testState = (window as Window & {
      __playbackLifecycleTest?: {
        audioContext: AudioContext | null;
        originalResume: (() => Promise<void>) | null;
      };
    }).__playbackLifecycleTest;
    if (!testState?.audioContext || !testState.originalResume) {
      throw new Error("The original AudioContext.resume method was not captured.");
    }
    Object.defineProperty(testState.audioContext, "resume", {
      configurable: true,
      value: testState.originalResume,
    });
  });
  await resumeButton.click();

  await expect.poll(async () => page.evaluate(() => window.__audioDebug), {
    timeout: 10_000,
  }).toMatchObject({
    contextState: "running",
    isPlaying: true,
    needsAudioResume: false,
    uiStatus: "playing",
  });
});
