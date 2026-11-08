import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';

export default defineConfig({
  expect: { timeout: 15000 }, testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 60000,
  // Preserve the console/HTML reports and surface CI failures as check annotations.
  reporter: [['list'], ['html', { open: 'never' }], ...(process.env.GITHUB_ACTIONS === 'true' ? [['github']] : [])],
  use: {
    reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:3100', viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process'), env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '/tmp/al2023/lib' } },
    trace: 'retain-on-failure', screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node server/test-server.mjs', url: 'http://127.0.0.1:3100/api/ready', reuseExistingServer: false,
    env: { PORT: '3100', DATA_DIR: '.data/e2e' }, timeout: 60000
  }
});
