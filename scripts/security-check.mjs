/**
 * 보안 정적 점검 (09 문서 §5 단계 9).
 *
 * Docker 없이도 돌아간다. 다음을 확인한다.
 *
 *   1) 클라이언트 번들에 **실제 비밀값**이 들어갔는가
 *      (.env.local 의 값을 그대로 찾는다 — 가장 확실한 검사)
 *   2) 클라이언트 번들에 비밀 환경변수 **이름**이 남았는가
 *   3) 클라이언트 번들에 정답 컬럼명(`is_correct`)이 들어갔는가
 *   4) 소스에 `NEXT_PUBLIC_` 접두사가 붙은 비밀값이 있는가
 *   5) 클라이언트 컴포넌트가 서버 전용 모듈을 import 하는가 (eslint 보완)
 *   6) 로그 호출에 토큰·쿠키·이메일이 섞여 있는가
 *
 * 한계: 런타임 동작(RLS, API 응답 본문)은 검증하지 못한다. 그쪽은
 * 통합 테스트(TC-RLS-*, TC-SEC-01)가 담당하며 DB가 있어야 한다.
 *
 * 사용: node scripts/security-check.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const findings = [];

function fail(rule, detail) {
  findings.push({ level: 'error', rule, detail });
}

function warn(rule, detail) {
  findings.push({ level: 'warn', rule, detail });
}

function walk(dir, filter) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

// ── 1 · 2 · 3) 클라이언트 번들 검사 ────────────────────────────────────
const CLIENT_DIR = join(ROOT, '.next', 'static');
const bundles = walk(CLIENT_DIR, (file) => file.endsWith('.js'));

if (bundles.length === 0) {
  warn(
    'bundle-missing',
    '.next/static 이 없습니다. `npm run build` 후 다시 실행하세요.',
  );
}

/** .env.local 에서 비밀값을 읽어 번들에서 그대로 찾는다. */
function readSecrets() {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return [];

  const secrets = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    const value = rawValue.trim().replace(/^["']|["']$/g, '');
    if (!name || value.length < 16) continue;
    if (name.startsWith('NEXT_PUBLIC_')) continue; // 공개 전제
    secrets.push({ name, value });
  }
  return secrets;
}

const secrets = readSecrets();
const FORBIDDEN_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'GUEST_TOKEN_SECRET',
];

for (const file of bundles) {
  const content = readFileSync(file, 'utf8');
  const shown = relative(ROOT, file);

  for (const secret of secrets) {
    if (content.includes(secret.value)) {
      fail('secret-value-in-bundle', `${shown} 에 ${secret.name} 의 값이 그대로 들어 있습니다.`);
    }
  }

  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      fail('secret-name-in-bundle', `${shown} 에 ${name} 이 참조되어 있습니다.`);
    }
  }

  if (content.includes('is_correct')) {
    fail('answer-column-in-bundle', `${shown} 에 정답 컬럼명(is_correct)이 들어 있습니다.`);
  }
}

// ── 4) 소스에 NEXT_PUBLIC_ 비밀값 ──────────────────────────────────────
const sources = walk(join(ROOT, 'src'), (file) => /\.(ts|tsx|mjs)$/.test(file));

for (const file of sources) {
  const content = readFileSync(file, 'utf8');
  const shown = relative(ROOT, file);

  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(`NEXT_PUBLIC_${name}`)) {
      fail('public-prefixed-secret', `${shown} 에 NEXT_PUBLIC_${name} 이 있습니다.`);
    }
  }
}

// ── 5) 클라이언트 컴포넌트의 서버 모듈 import ─────────────────────────
const SERVER_ONLY = [
  "from '@/server/",
  "from '@/lib/db/",
  "from '@/lib/supabase/admin'",
  "from 'postgres'",
];

for (const file of sources) {
  const content = readFileSync(file, 'utf8');
  if (!content.startsWith("'use client'")) continue;

  const shown = relative(ROOT, file);
  for (const pattern of SERVER_ONLY) {
    // 타입 전용 import는 번들에 남지 않는다.
    const lines = content
      .split('\n')
      .filter((line) => line.includes(pattern) && !line.includes('import type'));
    if (lines.length > 0) {
      fail('client-imports-server', `${shown} 가 서버 전용 모듈을 import 합니다: ${pattern}`);
    }
  }
}

// ── 6) 로그에 민감정보 ────────────────────────────────────────────────
const LOG_CALL = /console\.(log|info|warn|error|debug)\(([^)]*)\)/g;
const SENSITIVE = ['token', 'cookie', 'email', 'password', 'secret', 'session'];

for (const file of [...sources, ...walk(join(ROOT, 'scripts'), (f) => f.endsWith('.mjs'))]) {
  const content = readFileSync(file, 'utf8');
  const shown = relative(ROOT, file);

  for (const match of content.matchAll(LOG_CALL)) {
    const args = (match[2] ?? '').toLowerCase();
    for (const word of SENSITIVE) {
      // 문자열 리터럴 안의 단어는 설명 문구일 수 있으므로 변수 참조만 본다.
      const asVariable = new RegExp(`(^|[^'"\`\\w])${word}\\w*`, 'i');
      if (asVariable.test(args) && !args.includes(`'${word}`)) {
        warn('sensitive-log', `${shown} 의 로그 인자에 '${word}' 가 보입니다: ${match[0].slice(0, 80)}`);
      }
    }
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────
const errors = findings.filter((item) => item.level === 'error');
const warnings = findings.filter((item) => item.level === 'warn');

for (const item of findings) {
  const tag = item.level === 'error' ? 'FAIL' : 'WARN';
  console.log(`  ${tag} [${item.rule}] ${item.detail}`);
}

console.log('');
console.log(
  `클라이언트 번들 ${bundles.length}개, 소스 ${sources.length}개 검사. ` +
    `오류 ${errors.length}건, 경고 ${warnings.length}건.`,
);
console.log(
  '한계: RLS와 API 응답 본문은 통합 테스트(DB 필요)에서만 검증된다.',
);

if (errors.length > 0) process.exit(1);
