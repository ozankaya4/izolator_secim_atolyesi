import { defineConfig, devices } from '@playwright/test';
const externalURL = process.env.BASE_URL;
export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalURL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1080 } },
    },
  ],
  webServer: externalURL
    ? undefined
    : [
        {
          command:
            'uv run --directory ../backend uvicorn isolator.api.main:app --host 127.0.0.1 --port 8000',
          url: 'http://127.0.0.1:8000/api/health',
          reuseExistingServer: !process.env.CI,
        },
        { command: 'pnpm dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
      ],
});
