/**
 * DB 지문 채취.
 *
 * 백업·복구 리허설에서 "복구되었다"를 눈대중으로 판단하지 않기 위한 것이다.
 * 테이블별 행 수와 핵심 집계를 찍어 복구 전후를 기계적으로 대조한다.
 *
 * 사용:
 *   node scripts/db-fingerprint.mjs > before.json
 *   node scripts/db-fingerprint.mjs > after.json
 *   node scripts/db-fingerprint.mjs --compare before.json after.json
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const TABLES = [
  'teams',
  'players',
  'question_categories',
  'questions',
  'question_sources',
  'profiles',
  'guest_sessions',
  'play_sessions',
  'at_bats',
  'user_batting_stats',
  'user_private_stats',
  'user_zone_cells',
  'xp_transactions',
  'seasons',
  'admin_users',
];

async function fingerprint() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL이 없습니다.');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 2 });
  const counts = {};

  try {
    for (const table of TABLES) {
      const [row] = await sql`
        select count(*)::int as c from public.${sql(table)}
      `;
      counts[table] = row?.c ?? 0;
    }

    // 정답은 private 스키마라 따로 센다.
    const [options] = await sql`
      select count(*)::int as c from private.question_options
    `;
    counts['private.question_options'] = options?.c ?? 0;

    // 행 수만으로는 내용 변화를 못 잡는다. 핵심 집계도 함께 본다.
    const [agg] = await sql`
      select coalesce(sum(pa), 0)::int as total_pa,
             coalesce(sum(h), 0)::int as total_h,
             coalesce(sum(r), 0)::int as total_r
        from public.user_batting_stats
    `;
    const [xp] = await sql`
      select coalesce(sum(amount), 0)::int as total_xp from public.xp_transactions
    `;
    const [published] = await sql`
      select count(*)::int as c from public.questions where status = 'published'
    `;

    return {
      takenAt: new Date().toISOString(),
      counts,
      aggregates: {
        battingPa: agg?.total_pa ?? 0,
        battingH: agg?.total_h ?? 0,
        battingR: agg?.total_r ?? 0,
        xpTotal: xp?.total_xp ?? 0,
        publishedQuestions: published?.c ?? 0,
      },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function compare(beforePath, afterPath) {
  const before = JSON.parse(readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(readFileSync(afterPath, 'utf8'));
  const problems = [];

  for (const [key, value] of Object.entries(before.counts)) {
    if (after.counts[key] !== value) {
      problems.push(`${key}: ${value} → ${after.counts[key]}`);
    }
  }
  for (const [key, value] of Object.entries(before.aggregates)) {
    if (after.aggregates[key] !== value) {
      problems.push(`집계 ${key}: ${value} → ${after.aggregates[key]}`);
    }
  }

  if (problems.length === 0) {
    console.log('일치: 복구 전후 지문이 같습니다.');
    return 0;
  }

  console.error(`불일치 ${problems.length}건:`);
  for (const problem of problems) console.error(`  ${problem}`);
  return 1;
}

const compareIndex = process.argv.indexOf('--compare');
if (compareIndex >= 0) {
  process.exit(compare(process.argv[compareIndex + 1], process.argv[compareIndex + 2]));
} else {
  console.log(JSON.stringify(await fingerprint(), null, 2));
}
