/**
 * 홈 배경 — 야간 야구장(직접 그린 SVG, 사진·외부 그림 없음).
 *
 *   node scripts/make-stadium.mjs   → src/assets/brand/night-stadium.svg
 *
 * 화면은 `background-size: cover; background-position: center bottom`으로 깐다. 폰(세로로 긴 카드)에서는
 * 가운데 약 40%만 보이므로 조명·홈 플레이트·내야를 가운데에 모았다. 빛 번짐은 필터 대신 원형 그라데이션
 * (폰에서 가볍다). 글자가 올라가는 가운데·아래는 어둡게 두고, 화면 쪽 CSS가 한 번 더 어둡게 덮는다.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 1200;
const H = 1000;
const r = (n) => Math.round(n * 10) / 10;

// 지붕 트러스: 위·아래 두 줄의 완만한 아치, 사이를 지그재그로
const arch = (x, top, sag) => top + sag * ((x - W / 2) / (W / 2)) ** 2;
const upper = (x) => arch(x, 120, 150);
const lower = (x) => arch(x, 170, 150);
const STEP = 40;
let truss = '';
let zig = `M0 ${r(lower(0))}`;
for (let x = 0; x <= W; x += STEP) {
  const up = (x / STEP) % 2 === 1;
  zig += ` L${x} ${r(up ? upper(x) : lower(x))}`;
}
const curve = (fn) => {
  let d = `M0 ${r(fn(0))}`;
  for (let x = 20; x <= W; x += 20) d += ` L${x} ${r(fn(x))}`;
  return d;
};
truss += `<path d="${curve(upper)}"/><path d="${curve(lower)}"/><path d="${zig}" stroke-width="1.5"/>`;

// 조명 묶음: 트러스 아래에 매달린 등 여러 개 + 큰 빛 번짐
const banks = [180, 330, 470, 600, 730, 870, 1020];
let glows = '';
let lamps = '';
for (const [index, cx] of banks.entries()) {
  const cy = lower(cx) + 26;
  const big = index === 3 ? 1.25 : index === 2 || index === 4 ? 1.1 : 0.9;
  glows += `<ellipse cx="${cx}" cy="${r(cy + 40)}" rx="${r(170 * big)}" ry="${r(120 * big)}" fill="url(#haze)"/>`;
  glows += `<circle cx="${cx}" cy="${r(cy)}" r="${r(46 * big)}" fill="url(#glow)"/>`;
  for (let k = -2; k <= 2; k++) {
    lamps += `<circle cx="${cx + k * 11}" cy="${r(cy + Math.abs(k) * 2)}" r="${k === 0 ? 4.2 : 3.4}"/>`;
  }
}

// 하늘의 작은 별빛(고정 위치 — 매번 같은 그림)
let stars = '';
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 26; i++) {
  const x = rand() * W;
  const y = rand() * 110 + 10;
  stars += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.8 + rand() * 1.2)}" opacity="${r(0.25 + rand() * 0.45)}"/>`;
}

// 원근: 홈 플레이트(600, 900)에서 파울 선이 양옆 위로 뻗는다
const HOME = { x: 600, y: 905 };
const foulLeft = { x: -120, y: 600 };
const foulRight = { x: 1320, y: 600 };
const towards = (a, b, t) => ({ x: r(a.x + (b.x - a.x) * t), y: r(a.y + (b.y - a.y) * t) });
const first = towards(HOME, foulRight, 0.36);
const third = towards(HOME, foulLeft, 0.36);
const second = { x: 600, y: 752 };

// 잔디 줄무늬(원근으로 모이는 띠)
let stripes = '';
for (let i = -6; i < 6; i += 2) {
  const x1 = 600 + i * 260;
  const x2 = 600 + (i + 1) * 260;
  stripes += `<path d="M${600 + i * 60} 585 L${600 + (i + 1) * 60} 585 L${x2} ${H} L${x1} ${H} Z"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040812"/><stop offset=".55" stop-color="#0b1730"/><stop offset="1" stop-color="#15284a"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#dbe8ff" stop-opacity=".45"/><stop offset="1" stop-color="#9ab8ff" stop-opacity="0"/></radialGradient>
<radialGradient id="haze"><stop offset="0" stop-color="#b9cdf5" stop-opacity=".1"/><stop offset="1" stop-color="#b9cdf5" stop-opacity="0"/></radialGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d6b35"/><stop offset=".5" stop-color="#18602f"/><stop offset="1" stop-color="#0e3f1f"/></linearGradient>
<linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a45f34"/><stop offset="1" stop-color="#7d4524"/></linearGradient>
<linearGradient id="stands" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a2c"/><stop offset="1" stop-color="#0a111d"/></linearGradient>
<pattern id="crowd" width="9" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#2a3a55"/><circle cx="6.5" cy="5" r="1.1" fill="#22304a"/></pattern>
<radialGradient id="pool" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#e9f2ff" stop-opacity=".16"/><stop offset="1" stop-color="#e9f2ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g fill="#cfe0ff">${stars}</g>
<path d="M0 ${r(lower(0) + 120)} Q600 ${r(lower(600) + 20)} ${W} ${r(lower(W) + 120)} L${W} 590 L0 590 Z" fill="url(#stands)"/>
<path d="M0 ${r(lower(0) + 150)} Q600 ${r(lower(600) + 70)} ${W} ${r(lower(W) + 150)} L${W} 560 L0 560 Z" fill="url(#crowd)" opacity=".9"/>
<path d="M0 ${r(lower(0) + 150)} Q600 ${r(lower(600) + 70)} ${W} ${r(lower(W) + 150)}" fill="none" stroke="#33466a" stroke-width="3"/>
<path d="M0 470 Q600 430 ${W} 470" fill="none" stroke="#24334f" stroke-width="5"/>
<g fill="none" stroke="#3a4d72" stroke-width="2.5" stroke-linejoin="round">${truss}</g>
${glows}
<g fill="#fff">${lamps}</g>
<rect y="560" width="${W}" height="28" fill="#0d2238"/>
<rect y="560" width="${W}" height="3" fill="#2f4a6e"/>
<rect y="585" width="${W}" height="${H - 585}" fill="url(#grass)"/>
<g fill="#ffffff" opacity=".045">${stripes}</g>
<ellipse cx="600" cy="585" rx="760" ry="330" fill="url(#pool)"/>
<path d="M${third.x} ${third.y} Q600 ${second.y - 40} ${first.x} ${first.y} L${r(first.x + 80)} ${r(first.y + 60)} Q600 ${H + 40} ${r(third.x - 80)} ${r(third.y + 60)} Z" fill="url(#dirt)" opacity=".92"/>
<path d="M${third.x} ${third.y} L600 ${r(second.y + 10)} L${first.x} ${first.y} L${HOME.x} ${HOME.y} Z" fill="url(#grass)"/>
<ellipse cx="600" cy="${r(second.y + 52)}" rx="34" ry="11" fill="#9a5a31"/>
<rect x="592" y="${r(second.y + 49)}" width="16" height="3" fill="#f4efe6"/>
<ellipse cx="600" cy="${HOME.y}" rx="120" ry="38" fill="#93542d"/>
<g fill="none" stroke="#f4efe6" stroke-width="4" stroke-linecap="round" opacity=".92">
<path d="M${HOME.x} ${HOME.y} L${foulLeft.x} ${foulLeft.y}"/><path d="M${HOME.x} ${HOME.y} L${foulRight.x} ${foulRight.y}"/>
<path d="M542 ${HOME.y - 18} h44 v30 h-44 Z" stroke-width="3"/><path d="M614 ${HOME.y - 18} h44 v30 h-44 Z" stroke-width="3"/>
</g>
<path d="M590 ${HOME.y - 6} h20 l0 7 -10 7 -10 -7 Z" fill="#f4efe6"/>
<g fill="#f4efe6"><rect x="${r(first.x - 8)}" y="${r(first.y - 5)}" width="16" height="10" rx="2"/><rect x="${r(third.x - 8)}" y="${r(third.y - 5)}" width="16" height="10" rx="2"/><rect x="592" y="${r(second.y + 2)}" width="16" height="10" rx="2"/></g>
</svg>
`;

const out = fileURLToPath(new URL('../src/assets/brand/night-stadium.svg', import.meta.url));
writeFileSync(out, svg.replace(/\n/g, ''));
console.log(out, svg.length, 'bytes');
