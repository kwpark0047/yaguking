/**
 * 앱인토스 콘솔 로고(docs/toss-miniapp.md) — 운영자가 준 그림(저장소 밖 `야구왕캐릭터.png`)에서 바깥 흰 바탕만 지우고,
 * 600×600 정사각형 **배경색 위에** 얹는다. 콘솔 규칙: PNG, 배경색 필수(투명 금지), 둥근 모서리 금지.
 *
 *   node scripts/make-toss-logo.mjs ../야구왕캐릭터.png toss/console
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');
const [src, outDir] = process.argv.slice(2);

const SIZE = 600;
const INNER = 540; // 그림이 차지하는 높이(둘레 여백 30px)
const VARIANTS = [
  ['logo-600.png', { r: 0xff, g: 0xf4, b: 0xd6 }], // 앱 로고 — 밝은 금빛 바탕(흰 화면에서도 바탕이 보이게)
  ['logo-dark-600.png', { r: 0x0b, g: 0x17, b: 0x30 }], // 다크모드 앱 로고 — 야구장 밤하늘 색
];

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const isWhite = (i) => data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;

// 가장자리에서 이어진 흰색만 지운다(공 속·글자 속 흰색은 그대로)
const seen = new Uint8Array(w * h);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const at = y * w + x;
  if (seen[at] || !isWhite(at * 4)) return;
  seen[at] = 1;
  stack.push(at);
};
for (let x = 0; x < w; x += 1) {
  push(x, 0);
  push(x, h - 1);
}
for (let y = 0; y < h; y += 1) {
  push(0, y);
  push(w - 1, y);
}
while (stack.length > 0) {
  const at = stack.pop();
  data[at * 4 + 3] = 0;
  const x = at % w;
  const y = (at - x) / w;
  push(x + 1, y);
  push(x - 1, y);
  push(x, y + 1);
  push(x, y - 1);
}

const emblem = await sharp(await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer())
  .trim()
  .resize({ width: INNER, height: INNER, fit: 'inside' })
  .png()
  .toBuffer();

for (const [name, background] of VARIANTS) {
  const out = join(outDir, name);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background } })
    .composite([{ input: emblem, gravity: 'center' }])
    .flatten({ background })
    .removeAlpha()
    .png()
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`${out}: ${meta.width}×${meta.height}, alpha ${meta.hasAlpha}`);
}
