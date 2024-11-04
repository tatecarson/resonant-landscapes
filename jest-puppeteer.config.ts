import { Config } from 'jest-puppeteer';

const config: Config = {
  launch: {
    headless: false, // Set to false to see the browser
    slowMo: 50, // Slows down operations by 50ms
    defaultViewport: null,
    args: ['--start-maximized'] // Optional: starts with maximized window
  },
  server: {
    command: 'npm run dev',
    port: 5173,
    launchTimeout: 10000,
  },
};

export default config;