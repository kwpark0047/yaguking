/**
 * Hosting 전송량 측정 — 첫 방문에 내려받는 파일 크기(압축 후)를 잰다. 무료 한도는 하루 360 MB.
 *
 * 만든 결과물(dist)을 `vite preview`로 띄우고 실제 브라우저(Playwright Chromium)로
 * 메인 → 게임 시작까지 간다. 요청한 같은 출처 파일을 dist에서 찾아 gzip 크기를 더한다
 * (Hosting은 gzip·brotli로 보낸다. brotli가 더 작으니 이 값은 넉넉한 쪽이다).
 * 글꼴(woff2)·그림은 이미 압축돼 있어 원래 크기로 센다.
 *
 * 비회원 로그인·Firestore가 필요해 에뮬레이터 안에서 돈다:
 *   npm run usage:transfer   (빌드 → 에뮬레이터 → 이 스크립트)
 * USAGE_TRANSFER=경로 를 주면 JSON으로도 남긴다.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const PORT = 4175;
const origin = `http://localhost:${PORT}`;
const DAILY_LIMIT_MB = 360;

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist가 없습니다. 먼저 npm run build');
  process.exit(1);
}

const server = spawn(`npx vite preview --port ${PORT} --strictPort`, {
  cwd: root,
  shell: true,
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(origin);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('미리보기 서버가 뜨지 않았습니다.');
}

/** 같은 출처 경로 → 보낼 때 크기(바이트) */
function wireSize(path) {
  const file = join(dist, path === '/' || !path.includes('.') ? 'index.html' : decodeURIComponent(path));
  if (!existsSync(file)) return 0;
  const body = readFileSync(file);
  return /\.(woff2?|png|jpe?g|webp|avif)$/.test(file) ? body.length : gzipSync(body, { level: 9 }).length;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const seen = new Map();
  let stage = '메인';
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || seen.has(url.pathname)) return;
    seen.set(url.pathname, stage);
  });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  stage = '게임 시작';
  await page.getByRole('link', { name: /게임 시작/ }).click();
  await page.locator('#question-stem').waitFor({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  await browser.close();

  const rows = [...seen].map(([path, at]) => ({ path, at, bytes: wireSize(path) }));
  const total = (at) => rows.filter((row) => !at || row.at === at).reduce((sum, row) => sum + row.bytes, 0);
  const all = total();
  const result = {
    measuredAt: new Date().toISOString(),
    home: total('메인'),
    play: total('게임 시작'),
    firstVisit: all,
    firstVisitsPerDay: Math.floor((DAILY_LIMIT_MB * 1024 * 1024) / all),
    files: rows.sort((a, b) => b.bytes - a.bytes),
  };

  console.log('파일(압축 후, 큰 순):');
  for (const row of result.files) console.log(`  ${kb(row.bytes).padStart(10)}  ${row.at.padEnd(6)} ${row.path}`);
  console.log(`메인 ${kb(result.home)} + 게임 시작 ${kb(result.play)} = 첫 방문 ${kb(all)}`);
  console.log(`하루 ${DAILY_LIMIT_MB} MB면 첫 방문 약 ${result.firstVisitsPerDay.toLocaleString()}명 (다시 오면 index.html만 받는다)`);
  if (process.env.USAGE_TRANSFER) writeFileSync(process.env.USAGE_TRANSFER, `${JSON.stringify(result, null, 2)}\n`);
} finally {
  server.kill();
  if (process.platform === 'win32' && server.pid) spawn(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
}
