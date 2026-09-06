import { palette } from "./src/theme/palette.js";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /*
       * Named by role, not by hue, and sourced from src/theme/palette.js so a
       * palette change is one file. See that file for what each role is for
       * and the contrast each value was chosen to clear.
       */
      colors: {
        ink: {
          DEFAULT: palette.ink,
          muted: palette.inkMuted,
        },
        'on-ink': palette.onInk,
        ground: palette.ground,
        panel: palette.panel,
        surface: palette.surface,
        edge: palette.edge,
        accent: {
          DEFAULT: palette.accent,
          soft: palette.accentSoft,
        },
        beacon: palette.beacon,
        status: {
          error: palette.statusError,
          'error-surface': palette.statusErrorSurface,
          warning: palette.statusWarning,
          'warning-surface': palette.statusWarningSurface,
        },
      },
      /*
       * The two shadows that were written as arbitrary values with hand-typed
       * rgba inside them. Named here so they come from the ink token like
       * everything else.
       */
      boxShadow: {
        notice: `0 6px 20px rgb(${channels(palette.ink)} / 0.22)`,
        strip: `0 -1px 0 rgb(${channels(palette.ink)} / 0.10), 0 -12px 32px rgb(${channels(palette.ink)} / 0.08)`,
        console: `0 18px 45px rgb(${channels(palette.ink)} / 0.16)`,
      },
      fontFamily: {
        'cormorant': ['"Cormorant Garamond"', 'Georgia', 'serif'],
        'space-mono': ['"Space Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

function channels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)).join(' ');
}
