/**
 * 게임물관리위원회 등급분류 신청용 게임 진행 동영상(docs/grac-application.md) — 미니앱 빌드의 실제 화면을 처음부터 끝까지 녹화한다.
 * 메인 → 개인 경기 1이닝(안타·아웃·찬스 이벤트·3아웃·결과) → 오늘의 1이닝 → 오답노트. 에뮬레이터만 쓴다.
 *
 *   npx firebase emulators:exec --only auth,firestore --project demo-yaguking "node scripts/make-toss-video.mjs"
 *
 * 결과: toss/console/gameplay.webm(폰 세로 화면). 신청 사이트가 mp4를 요구하면 변환해서 낸다.
 */
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const PORT = 5178;
const BASE = `http://localhost:${PORT}`;
const SIZE = { width: 400, height: 720 };
const OUT = 'toss/console/gameplay.webm';

const bank = JSON.parse(readFileSync('src/content/questions.generated.json', 'utf8'));
const correctByStem = new Map(bank.map((question) => [question.stem, question.correct]));

const server = await createServer({ configFile: 'vite.toss.config.ts', server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const dir = mkdtempSync(join(tmpdir(), 'yaguking-video-'));
const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'ko-KR', recordVideo: { dir, size: SIZE } });
const page = await context.newPage();

const pause = (ms) => page.waitForTimeout(ms);

async function answer(correct, readMs) {
  await page.locator('#question-stem').waitFor({ timeout: 20_000 });
  await pause(readMs);
  const stem = (await page.locator('#question-stem').textContent())?.trim() ?? '';
  const right = correctByStem.get(stem);
  const label = correct ? right : ['A', 'B', 'C', 'D'].find((option) => option !== right);
  await page.getByRole('group', { name: '보기' }).locator('button', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).click();
}

try {
  await page.goto(`${BASE}/`);
  await page.getByRole('link', { name: /게임 시작/ }).waitFor();
  await pause(2500);
  await page.mouse.wheel(0, 700);
  await pause(2000);
  await page.mouse.wheel(0, -700);
  await pause(800);
  await page.getByRole('link', { name: /게임 시작/ }).click();

  // 개인 경기 — 맞히고 틀리며 3아웃까지(찬스 이벤트가 나오면 건너뛴다)
  const plan = [true, true, false, true, false, false, false, false];
  let outs = 0;
  for (const correct of plan) {
    if (outs >= 3) break;
    const skip = page.getByRole('button', { name: /건너뛰기/ });
    await Promise.race([page.locator('#question-stem').waitFor({ timeout: 20_000 }), skip.waitFor({ timeout: 20_000 }).then(async () => { await pause(1500); await skip.click(); })]);
    await answer(correct, correct ? 6000 : 3000);
    if (!correct) outs += 1;
    await pause(3000);
    const finish = page.getByRole('button', { name: '결과 보기' });
    if (await finish.count()) {
      await finish.click();
      break;
    }
    await page.getByRole('button', { name: '다음 타석' }).click();
  }
  await page.getByRole('heading', { name: /경기 종료/ }).waitFor({ timeout: 20_000 });
  await pause(4000);

  // 오늘의 1이닝
  await page.goto(`${BASE}/daily`);
  for (const index of [0, 1, 2]) {
    await answer(index !== 1, 3000);
    await pause(2500);
    await page.getByRole('button', { name: index < 2 ? '다음 문제' : '결과 보기' }).click();
  }
  await page.getByRole('heading', { name: '오늘의 1이닝 끝!' }).waitFor();
  await pause(3500);

  // 오답노트
  await page.goto(`${BASE}/notes`);
  await pause(3500);
} finally {
  const video = page.video();
  await context.close();
  if (video) copyFileSync(await video.path(), OUT);
  await browser.close();
  await server.close();
}
console.log(OUT);
