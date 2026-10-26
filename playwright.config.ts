import { loadLocalEnv } from './tests/support/loadLocalEnv';
import { defineConfig, devices } from '@playwright/test';

// 앱과 같은 `.env.local`을 읽는다 — DB가 필요한 시나리오와 회원 로그인 시나리오가
// 셸에서 변수를 따로 내보내지 않아도 돈다(tests/support/loadLocalEnv.ts).
loadLocalEnv();

/** 08 문서 §6의 3브레이크포인트 + reduced-motion 검증용 프로젝트 구성. */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'sm-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 } } },
    { name: 'md-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'lg-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'md-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 640 } },
    },
    {
      name: 'reduced-motion',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
    { name: 'mobile-device', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // 여러 프로젝트가 한 주소에서 병렬로 경기를 시작하므로 레이트 리밋에 걸린다.
    // Playwright가 직접 띄운 서버에만 적용된다 — 이미 떠 있는 개발 서버를 재사용하면
    // 그 서버도 `RATE_LIMIT=off`로 띄워야 한다 (OPERATIONS.md).
    env: { RATE_LIMIT: 'off' },
  },
});
