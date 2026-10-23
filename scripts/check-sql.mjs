/**
 * 마이그레이션 SQL 구문 검사.
 *
 * Docker 없이(= 로컬 Supabase 스택 없이) PostgreSQL 실제 파서로 문법을
 * 검증한다. 구문 오류는 잡지만 **의미 오류는 잡지 못한다** — 존재하지 않는
 * 테이블 참조, 권한, RLS 동작은 `npm run db:reset` 으로만 확인할 수 있다.
 *
 * 사용: node scripts/check-sql.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, parse, parsePlPgSQL } from 'libpg-query';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SEED = join(process.cwd(), 'supabase', 'seed.sql');

await loadModule();

const files = [
  ...readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f)),
  SEED,
];

let failed = 0;
let statements = 0;

for (const file of files) {
  const sql = readFileSync(file, 'utf8');
  const name = file.replace(process.cwd(), '').replace(/\\/g, '/');
  try {
    const result = await parse(sql);
    const count = result.stmts?.length ?? 0;
    statements += count;

    // 외부 파서는 함수 본문을 문자열로만 본다. plpgsql 본문은 따로 검사한다.
    let note = '';
    if (/language\s+plpgsql/i.test(sql)) {
      await parsePlPgSQL(sql);
      note = ' + plpgsql 본문';
    }
    console.log(`  ok   ${name}  (${count} statements${note})`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message}`);
  }
}

console.log('');
if (failed > 0) {
  console.error(`구문 오류 ${failed}개 파일. 총 ${statements} statements 파싱.`);
  process.exit(1);
}
console.log(`전체 ${files.length}개 파일, ${statements} statements 구문 검증 통과.`);
console.log('주의: 의미 검증(참조·권한·RLS)은 npm run db:reset 에서만 가능하다.');
