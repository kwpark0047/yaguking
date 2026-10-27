/**
 * 홈 화면 엠블럼 만들기 — 운영자가 준 그림(저장소 밖 `야구왕캐릭터.png`, 커밋 안 함)에서
 * 바깥 흰 바탕만 투명하게(공 속 흰색은 그대로), 테두리에 맞춰 자르고, 높이 440px WebP로.
 *
 *   node scripts/make-emblem.mjs ../야구왕캐릭터.png src/assets/brand/yaguking-emblem.webp
 */
import { createRequire } from 'node:module';

const require = createRequire(process.cwd() + '/package.json');
const sharp = require('sharp');
const [src, out] = process.argv.slice(2);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const white = (i) => Math.min(data[i], data[i + 1], data[i + 2]);
const seen = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
while (stack.length) {
  const p = stack.pop();
  if (seen[p] || white(p * 4) < 225) continue;
  seen[p] = 1;
  const x = p % w, y = (p / w) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < w - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - w);
  if (y < h - 1) stack.push(p + w);
}
for (let p = 0; p < w * h; p++) {
  if (seen[p]) { data[p * 4 + 3] = 0; continue; }
  // 바탕과 닿은 가장자리: 흰 기운만큼 투명하게(흰 테두리 띠 없애기)
  const x = p % w, y = (p / w) | 0;
  const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
  if (edge) {
    const wv = white(p * 4);
    if (wv > 150) data[p * 4 + 3] = Math.round(255 * (1 - (wv - 150) / 105));
  }
}
await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .trim({ threshold: 0 })
  .resize({ height: 440 })
  .webp({ quality: 86, alphaQuality: 90, effort: 6 })
  .toFile(out)
  .then((r) => console.log(r.width, r.height, r.size));
