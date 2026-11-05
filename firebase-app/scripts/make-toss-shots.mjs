/**
 * 앱인토스 콘솔 노출 이미지(docs/toss-miniapp.md) — 미니앱 빌드의 **실제 화면**을 찍어 toss/console/에 저장한다. 에뮬레이터만 쓴다.
 * 세로 636×1048 PNG 5장, 가로 1504×741 PNG 1장, 썸네일 1932×828 PNG 1장.
 * 콘솔 규칙: 썸네일은 핵심 플레이 화면, 글자는 짧게, 빈 공간을 색·블러로 채우지 않기, 작은 그림을 늘리지 않기.
 *
 *   npx firebase emulators:exec --only auth,firestore --project demo-yaguking "node scripts/make-toss-shots.mjs"
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');

const OUT = 'toss/console';
const PORT = 5177; // 개발 서버(5176)와 겹치지 않게
const BASE = `http://localhost:${PORT}`;
const PORTRAIT = { width: 636, height: 1048 };
const LANDSCAPE = { width: 1504, height: 741 };
const THUMBNAIL = { width: 1932, height: 828 };
// 폰 화면(400 폭)을 636 폭으로 찍는다 — 늘리지 않고 고해상도로 그린다. 콘솔 규격이 폰보다 짧아 400 폭이라야 경기 화면이 한 화면에 든다
const SCALE = PORTRAIT.width / 400;
const VIEWPORT = { width: 400, height: Math.round(PORTRAIT.height / SCALE) };

const bank = JSON.parse(readFileSync('src/content/questions.generated.json', 'utf8'));
const correctByStem = new Map(bank.map((question) => [question.stem, question.correct]));

const server = await createServer({ configFile: 'vite.toss.config.ts', server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();

async function open() {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, hasTouch: true, isMobile: true, colorScheme: 'light', reducedMotion: 'reduce', locale: 'ko-KR' });
  // 콘솔 규격(636×1048)은 실제 폰보다 짧다 — 글자 "소"로 찍어야 경기 화면이 내려가지 않고 머리줄부터 보기까지 한 화면에 든다
  await context.addInitScript(() => localStorage.setItem('yk_text', 's'));
  return context.newPage();
}

async function shot(page, name) {
  await page.waitForTimeout(350); // 화면 전환이 끝나게
  const raw = await page.screenshot();
  const out = join(OUT, name);
  await sharp(raw).resize(PORTRAIT.width, PORTRAIT.height, { fit: 'cover', position: 'top' }).removeAlpha().png().toFile(out);
  console.log(out);
  return out;
}

/** 화면의 문제를 일부러 맞히거나 틀린다(문제은행을 읽는다) */
async function answer(page, correct, readMs = 1200) {
  const stem = (await page.locator('#question-stem').textContent())?.trim() ?? '';
  await page.waitForTimeout(readMs); // 사람처럼 잠깐 읽고 답한다(응답 시각이 화면에 나온다)
  const right = correctByStem.get(stem);
  const label = correct ? right : ['A', 'B', 'C', 'D'].find((option) => option !== right);
  await page.getByRole('group', { name: '보기' }).locator('button', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).click();
}

try {
  // 1. 메인
  const home = await open();
  await home.goto(`${BASE}/`);
  await home.getByRole('link', { name: /게임 시작/ }).waitFor();
  const first = await shot(home, 'shot-1-home.png');
  await home.context().close();

  // 2·3. 개인 경기 — 문제, 맞힌 판정(곧바로 맞혀 장타)
  const play = await open();
  await play.goto(`${BASE}/play`);
  await play.locator('#question-stem').waitFor({ timeout: 20_000 });
  const second = await shot(play, 'shot-2-question.png');
  await answer(play, true, 5600); // 첫 문제는 5초를 빼고 판정·표시한다 — 2초 안(홈런)으로 보인다
  await play.getByRole('button', { name: '다음 타석' }).waitFor();
  const third = await shot(play, 'shot-3-verdict.png');
  // 3아웃까지 틀려 박스스코어로
  await play.getByRole('button', { name: '다음 타석' }).click();
  for (let out = 0; out < 3; out += 1) {
    const skip = play.getByRole('button', { name: /건너뛰기/ });
    await Promise.race([play.locator('#question-stem').waitFor({ timeout: 20_000 }), skip.waitFor({ timeout: 20_000 }).then(() => skip.click())]);
    await play.locator('#question-stem').waitFor({ timeout: 20_000 });
    await answer(play, false);
    await play.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await play.getByRole('heading', { name: /경기 종료/ }).waitFor({ timeout: 20_000 });
  await shot(play, 'shot-4-boxscore.png');
  await play.context().close();

  // 5. 오늘의 1이닝 결과(공유 줄)
  const daily = await open();
  await daily.goto(`${BASE}/daily`);
  for (const index of [0, 1, 2]) {
    await daily.locator('#question-stem').waitFor({ timeout: 20_000 });
    await answer(daily, index !== 1);
    await daily.getByRole('button', { name: index < 2 ? '다음 문제' : '결과 보기' }).click();
  }
  await daily.getByRole('heading', { name: '오늘의 1이닝 끝!' }).waitFor();
  // 개발 서버 주소 대신 미니앱이 실제로 쓰는 공유 링크로(src/toss/share.ts appUrl)
  await daily.evaluate((origin) => {
    const line = document.querySelector('[aria-label="공유할 글"]');
    if (line) line.textContent = line.textContent.replace(origin, 'intoss://yaguking');
  }, BASE);
  const fifth = await shot(daily, 'shot-5-daily.png');
  await daily.context().close();

  // 합성 이미지 — 야구장 밤 배경 위에 실제 화면
  const stadium = (size) => sharp('src/assets/brand/night-stadium.svg', { density: 300 }).resize(size.width, size.height, { fit: 'cover' }).png().toBuffer();
  const framed = async (file, height) => {
    const width = Math.round((height * PORTRAIT.width) / PORTRAIT.height);
    const radius = Math.round(height * 0.035);
    const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`);
    return { input: await sharp(file).resize(width, height).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), width };
  };

  // 가로 스크린샷 — 메인·문제·결과 세 화면
  const phoneHeight = 665;
  const phones = await Promise.all([first, second, fifth].map((file) => framed(file, phoneHeight)));
  const gap = Math.round((LANDSCAPE.width - phones.reduce((sum, phone) => sum + phone.width, 0)) / (phones.length + 1));
  let left = gap;
  const layers = phones.map((phone) => {
    const layer = { input: phone.input, left, top: Math.round((LANDSCAPE.height - phoneHeight) / 2) };
    left += phone.width + gap;
    return layer;
  });
  await sharp(await stadium(LANDSCAPE)).composite(layers).removeAlpha().png().toFile(join(OUT, 'shot-landscape.png'));
  console.log(join(OUT, 'shot-landscape.png'));

  // 썸네일 — 왼쪽 엠블럼·짧은 문구, 오른쪽 핵심 플레이 화면 둘(문제·판정)
  const emblem = await sharp('toss/console/logo-600.png').toBuffer().then(() => sharp('src/assets/brand/yaguking-emblem.webp').resize({ height: 640, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer());
  const emblemMeta = await sharp(emblem).metadata();
  const words = Buffer.from(`<svg width="620" height="150"><text x="310" y="108" font-family="Malgun Gothic, sans-serif" font-size="82" font-weight="700" fill="#ffffff" text-anchor="middle">빨리 맞히면 홈런</text></svg>`);
  const thumbPhones = await Promise.all([second, third].map((file) => framed(file, 770)));
  await sharp(await stadium(THUMBNAIL))
    .composite([
      { input: emblem, left: Math.round(390 - emblemMeta.width / 2), top: 20 },
      { input: words, left: 80, top: 660 },
      { input: thumbPhones[0].input, left: 820, top: 29 },
      { input: thumbPhones[1].input, left: 820 + thumbPhones[0].width + 50, top: 29 },
    ])
    .removeAlpha()
    .png()
    .toFile(join(OUT, 'thumbnail.png'));
  console.log(join(OUT, 'thumbnail.png'));
} finally {
  await browser.close();
  await server.close();
}
