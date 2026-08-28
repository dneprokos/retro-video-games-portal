// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Standalone config used only to record the "How to Add a New Game" guide video.
 * The application must already be running (Docker publishes the client on :9000).
 *
 * Usage: npx playwright test --config=playwright.video.config.js
 */
module.exports = defineConfig({
  testDir: './video',
  timeout: 180000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './video-output',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:9000',
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [{ name: 'guide-recording' }],
});
