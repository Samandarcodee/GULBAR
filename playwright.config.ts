import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, reporter: 'list', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3107', browserName: 'chromium', screenshot: 'only-on-failure' },
  webServer: { command: 'node tests/serve.js', url: 'http://127.0.0.1:3107/api/health', reuseExistingServer: false },
});
