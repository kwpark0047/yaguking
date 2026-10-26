import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * 테스트가 앱과 같은 `.env.local`을 읽게 한다.
 *
 * Next의 `@next/env`는 `NODE_ENV=test`일 때 `.env.local`을 **일부러 건너뛴다**
 * (테스트 재현성을 위해서다). 그런데 이 프로젝트의 통합·E2E 테스트는 로컬
 * Supabase를 쓰고, 그 주소와 키가 `.env.local`에만 있다. 그래서 예전에는 셸에서
 * DATABASE_URL을 직접 내보내야 했고, 관리자 키가 없어 계정 삭제 테스트는 늘
 * 건너뛰었다.
 *
 * 이미 셸에 있는 값은 덮어쓰지 않는다. 통합 테스트는 여전히 로컬 DB가 아니면
 * 멈춘다(tests/integration/helpers/fixtures.ts assertLocalDatabase).
 */
export function loadLocalEnv(cwd: string = process.cwd()): Record<string, string> {
  const file = resolve(cwd, '.env.local');
  if (!existsSync(file)) return {};

  const parsed = parseEnv(readFileSync(file, 'utf8')) as Record<string, string>;
  const applied: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
    applied[key] = process.env[key]!;
  }
  return applied;
}
