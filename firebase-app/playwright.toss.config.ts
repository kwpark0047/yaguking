import { spawnSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const hasJava = spawnSync('java', ['-version']).status === 0;
if (hasJava) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

/** 앱인토스 미니앱판 E2E(docs/toss-miniapp.md) — 토스 앱 밖의 브라우저에서 미니앱 빌드 설정(vite.toss.config.ts)을 연다. 에뮬레이터만 쓴다 */
export default defineConfig({
  testDir: './tests/toss',
  outputDir: './test-results/toss',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5176',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 740 },
    colorScheme: 'dark', // 기기가 어두운 모드여도 미니앱은 밝은 화면이어야 한다
  },
  webServer: [
    {
      command: `npx firebase emulators:start --only ${hasJava ? 'auth,firestore' : 'auth'} --project demo-yaguking`,
      url: hasJava ? 'http://127.0.0.1:8080' : 'http://127.0.0.1:9099',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --config vite.toss.config.ts --port 5176 --strictPort',
      url: 'http://localhost:5176',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
