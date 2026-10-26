import { spawnSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

/** Firestore 에뮬레이터는 Java(JDK 21)가 있어야 돈다. 없으면 Auth만 띄운다. */
const hasJava = spawnSync('java', ['-version']).status === 0;
if (hasJava) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

/**
 * Firebase판 E2E. 실제 Firebase 프로젝트 없이 **로컬 에뮬레이터**에 붙는다.
 *
 * Java가 있으면 Auth + Firestore 에뮬레이터를, 없으면 Auth만 띄운다. 만 14세 확인처럼
 * Firestore에 쓰는 시나리오는 FIRESTORE_EMULATOR_HOST가 있을 때만 돈다.
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
      command: `npx firebase emulators:start --only ${hasJava ? 'auth,firestore' : 'auth'} --project demo-yaguking`,
      // Firestore가 더 늦게 뜬다. 둘 다 같은 프로세스라 Firestore를 기다리면 Auth도 떠 있다.
      url: hasJava ? 'http://127.0.0.1:8080' : 'http://127.0.0.1:9099',
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
