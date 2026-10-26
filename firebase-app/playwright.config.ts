import { defineConfig, devices } from '@playwright/test';

/**
 * Firebase판 E2E. 실제 Firebase 프로젝트 없이 **로컬 에뮬레이터**에 붙는다.
 *
 * 지금은 Auth 에뮬레이터만 띄운다(Node로 돈다). Firestore 에뮬레이터는 Java가
 * 필요해, 만 14세 확인처럼 Firestore에 쓰는 시나리오는 FIRESTORE_EMULATOR_HOST가
 * 있을 때만 돈다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'sm-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } } },
    { name: 'lg-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: 'npx firebase emulators:start --only auth --project demo-yaguking',
      url: 'http://127.0.0.1:9099',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
