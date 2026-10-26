/**
 * 제목 글꼴(Jua) 줄이기 — Hosting 전송 한도(하루 360 MB)를 아낀다.
 *
 * @fontsource/jua의 한글 파일(woff2 약 360 KB)은 첫 방문 전송량(약 0.7 MB)의 절반이다.
 * 제목 글꼴(.font-cute)은 화면 문구에만 쓰므로 **src 아래 .ts·.tsx에 나오는 한글**(처리방침 본문 제외)
 * + ASCII + 문장 부호만 남긴다. 빠진 글자(닉네임 등)는 브라우저가 다음 글꼴
 * (system-ui)로 그린다. 남긴 글자는 jua-subset.txt에 적어 두고, 단위 테스트가 화면
 * 문구와 어긋나지 않았는지 본다(문구를 바꾸면 이 스크립트를 다시 돌린다 — build가 돌린다).
 *
 * 글꼴은 SIL OFL 1.1이며 예약 글꼴 이름이 없어 줄인 판을 같은 이름으로 써도 된다.
 * 라이선스는 public/licenses/jua-OFL.txt로 함께 배포한다.
 *
 *   node scripts/subset-font.mjs
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/@fontsource/jua/files/jua-korean-400-normal.woff2');
const target = join(root, 'src/assets/fonts/jua-subset.woff2');
const listFile = join(root, 'src/assets/fonts/jua-subset.txt');
const license = join(root, 'public/licenses/jua-OFL.txt');

const EXTRA = ' ·…–—‘’“”「」『』〈〉《》※○●◎◇◆□■△▲▽▼→←↑↓◀▶☆★♥';

/** 소스 코드에 나오는 한글(정렬) */
export function hangulInSource(dir = join(root, 'src')) {
  const found = new Set();
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      // 처리방침 본문은 제목 글꼴을 쓰지 않는다(넣으면 글꼴 파일이 커진다)
      else if (/\.(ts|tsx)$/.test(name) && name !== 'privacy.ts') for (const char of readFileSync(child, 'utf8')) if (/[가-힣]/.test(char)) found.add(char);
    }
  };
  walk(dir);
  return [...found].sort().join('');
}

const hangul = hangulInSource();
let ascii = '';
for (let code = 0x20; code <= 0x7e; code += 1) ascii += String.fromCharCode(code);

const input = readFileSync(source);
const output = await subsetFont(input, hangul + ascii + EXTRA, { targetFormat: 'woff2' });
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output);
writeFileSync(listFile, `${hangul}\n`);
mkdirSync(dirname(license), { recursive: true });
copyFileSync(join(root, 'node_modules/@fontsource/jua/LICENSE'), license);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
console.log(`Jua: 한글 ${hangul.length}자, ${kb(statSync(source).size)} → ${kb(output.length)}`);
