/**
 * 배포 전 점검 — `firebase deploy`가 Hosting을 올리기 **직전에 자동으로** 돈다(firebase.json predeploy).
 * 하나라도 걸리면 배포가 멈춘다. 직접 돌려 볼 수도 있다: `npm run deploy:check` (배포하지 않는다).
 *
 * 1. 대상 프로젝트: `demo-`로 시작하면 거절(에뮬레이터 전용 ID). Firebase CLI가 GCLOUD_PROJECT로 알려 준다
 * 2. 설정: VITE_FIREBASE_* 네 값이 있고, 프로젝트 ID가 배포 대상과 같아야 한다
 * 3. 운영용으로 다시 빌드(VITE_USE_EMULATORS=false) 뒤 결과물 검사:
 *    에뮬레이터 주소·데모 설정이 남았거나, 비밀 키·서비스 계정·소스맵·공식 정답이 섞였으면 거절
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_ENV = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

/** 결과물에 있으면 안 되는 것 — [이유, 찾을 글자 또는 정규식] */
export const FORBIDDEN = [
  ['에뮬레이터 주소', /127\.0\.0\.1:(9099|8080)|localhost:(9099|8080)/],
  ['데모 프로젝트 설정', /demo-yaguking/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['서비스 계정 파일', /"type"\s*:\s*"service_account"/],
  ['공식 정답 문서', /officialKeys/],
];

/** 프로젝트·설정 값 점검. 문제 목록을 돌려준다(비어 있으면 통과) */
export function checkTarget(project, env) {
  const problems = [];
  if (!project) problems.push('배포 대상 프로젝트를 모릅니다(--project 또는 firebase use).');
  else if (project.startsWith('demo-')) problems.push(`"${project}"는 에뮬레이터 전용 데모 ID라 배포할 수 없습니다.`);
  for (const key of REQUIRED_ENV) if (!env[key]) problems.push(`${key}가 비어 있습니다(.env.production.local).`);
  if (project && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_PROJECT_ID !== project) {
    problems.push(`앱 설정의 프로젝트(${env.VITE_FIREBASE_PROJECT_ID})와 배포 대상(${project})이 다릅니다.`);
  }
  return problems;
}

/** 결과물 파일 점검. files = [{ path, text }] */
export function checkDist(files) {
  const problems = [];
  if (!files.some((file) => file.path === 'index.html')) problems.push('dist/index.html이 없습니다.');
  for (const file of files) {
    if (file.path.endsWith('.map')) problems.push(`소스맵이 들어 있습니다: ${file.path}`);
    if (/\.(env|pem|key)$|service-?account/i.test(file.path)) problems.push(`올리면 안 되는 파일: ${file.path}`);
    if (file.text === null) continue;
    for (const [reason, pattern] of FORBIDDEN) {
      if (pattern.test(file.text)) problems.push(`${reason}이(가) 들어 있습니다: ${file.path}`);
    }
  }
  return problems;
}

/** 빌드 때 Vite가 읽는 것과 같은 순서로 .env 파일을 읽는다(운영 빌드) */
export function loadEnv(dir, processEnv = process.env) {
  const merged = {};
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    let text;
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) merged[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  for (const key of Object.keys(processEnv)) if (key.startsWith('VITE_')) merged[key] = processEnv[key];
  return merged;
}

function readDist(dir) {
  const files = [];
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else {
        const rel = relative(dir, child).replaceAll('\\', '/');
        const text = /\.(html|js|css|json|txt|map|webmanifest)$/.test(name) ? readFileSync(child, 'utf8') : null;
        files.push({ path: rel, text });
      }
    }
  };
  walk(dir);
  return files;
}

function fail(problems) {
  console.error('\n배포 전 점검 실패 — 배포하지 않습니다:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = process.env.GCLOUD_PROJECT ?? process.argv.find((arg) => arg.startsWith('--project='))?.slice(10);
  const env = { ...loadEnv(root), VITE_USE_EMULATORS: 'false' };
  const targetProblems = checkTarget(project, env);
  if (targetProblems.length > 0) fail(targetProblems);

  console.log(`운영용 빌드(${project})…`);
  execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_USE_EMULATORS: 'false' } });

  const distProblems = checkDist(readDist(join(root, 'dist')));
  if (distProblems.length > 0) fail(distProblems);
  console.log('배포 전 점검 통과.');
}
