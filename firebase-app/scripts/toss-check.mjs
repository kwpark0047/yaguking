/**
 * 앱인토스 미니앱판 결과물 점검(docs/toss-miniapp.md) — `npm run toss:build`가 .ait로 묶기 전에 돈다.
 * 공통 점검(데모 설정·비밀 키·소스맵·공식 정답·관리자 코드)에 더해 정책에 걸리는 것이 묶음에 없는지 본다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDist } from './predeploy-check.mjs';

/** [이유, 찾을 패턴] — 코드에서 쓰일 때만 남는 이름으로 고른다(압축돼도 문자열은 남는다) */
export const FORBIDDEN_IN_TOSS = [
  ['구글 로그인', /accounts\.google\.com|GoogleAuthProvider|google\.com\b.*signInWith/],
  ['서비스 워커 등록', /serviceWorker\.register/],
  ['홈 화면 설치 권유', /beforeinstallprompt/],
  ['달력 파일·외부 일정 링크', /calendar\.google\.com|BEGIN:VCALENDAR/],
  ['매니페스트', /manifest\.webmanifest/],
];

/** 결과물 점검. files = [{ path, text }] */
export function checkTossDist(files) {
  const problems = checkDist(files, 'app');
  // Tailwind가 src/를 못 읽으면 화면이 통째로 무너진다(글자만 남음) — 공용 화면이 쓰는 클래스가 CSS에 있어야 한다
  const css = files.filter((file) => file.path.endsWith('.css')).map((file) => file.text ?? '').join('');
  for (const name of ['min-h-14', 'sr-only', 'g-option']) if (!css.includes(name)) problems.push(`CSS에 ${name}이(가) 없습니다 — Tailwind가 src/를 읽지 못했습니다`);
  for (const file of files) {
    if (file.text === null) continue;
    for (const [reason, pattern] of FORBIDDEN_IN_TOSS) {
      if (pattern.test(file.text)) problems.push(`${reason}이(가) 들어 있습니다: ${file.path}`);
    }
  }
  return problems;
}

function walk(dir, root = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, root, out);
    else out.push({ path: relative(root, path).replaceAll('\\', '/'), text: /\.(html|js|css|json|txt)$/.test(name) ? readFileSync(path, 'utf8') : null });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = fileURLToPath(new URL('../dist-toss', import.meta.url));
  const files = walk(dist);
  const problems = checkTossDist(files);
  const mb = files.reduce((sum, file) => sum + statSync(join(dist, file.path)).size, 0) / 1024 / 1024;
  if (mb > 100) problems.push(`묶음이 ${mb.toFixed(1)} MB — 앱인토스 한도는 압축 해제 기준 100 MB`);
  if (problems.length > 0) {
    console.error(`미니앱 점검 실패 ${problems.length}건\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`미니앱 점검 통과(${files.length}개 파일, ${mb.toFixed(1)} MB).`);
}
