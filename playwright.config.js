/**
 * Playwright Configuration
 * Used for E2E and performance tests.
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/performance',
  testMatch: ['**/tests/performance/**/*.spec.js'],
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npm start',
    port: 3000,
    timeout: 30000,
    reuseExistingServer: true,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/performance/reports' }],
  ],
});
