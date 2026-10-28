/**
 * PWA 아이콘(public/icons/*.png) — 앱 엠블럼(src/assets/brand/yaguking-emblem.webp)을 야구장 밤하늘 색(#0b1730) 정사각형 위에 얹는다.
 * 새 의존성 없이 이미 있는 Playwright Chromium으로 그려 PNG로 찍는다.
 *
 *   node scripts/make-icons.mjs
 *
 * - any: 엠블럼이 높이의 86%
 * - maskable: 원·물방울 모양으로 잘려도 안 잘리게 가운데 안전 구역(지름 80%) 안 — 엠블럼 높이 62%
 * - apple-touch-icon(180): iOS 홈 화면(iOS는 maskable을 쓰지 않고 모서리를 둥글게 자른다)
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const EMBLEM = readFileSync(fileURLToPath(new URL('../src/assets/brand/yaguking-emblem.webp', import.meta.url))).toString('base64');
const BACKGROUND = '#0b1730';

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.86 },
  { file: 'icon-512.png', size: 512, scale: 0.86 },
  { file: 'icon-maskable-192.png', size: 192, scale: 0.62 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.62 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.8 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, scale } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;width:${size}px;height:${size}px;background:${BACKGROUND};display:flex;align-items:center;justify-content:center">` +
        `<img src="data:image/webp;base64,${EMBLEM}" style="height:${Math.round(size * scale)}px;width:auto"></body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    await page.screenshot({ path: `${OUT}${file}`, omitBackground: false });
    await page.close();
    console.log(`public/icons/${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
