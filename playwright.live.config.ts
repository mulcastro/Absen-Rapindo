import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-live',
  workers: 1,
  reporter: 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
