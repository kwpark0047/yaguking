/**
 * 문제은행 건강 검사.
 *
 * 노출 전에 **문항을 읽지 않고 푸는 길**이 열려 있는지 본다. 속도가 타구
 * 결과를 정하는 게임이라, 찍기가 통하면 기믹이 무력해진다.
 *
 * 오류(exit 1)로 막는 것: 정답 위치 쏠림, 게시 조건 미충족, 라벨 깨짐.
 * 경고만 하는 것: 보기 길이 쏠림 — 고치려면 오답을 다시 써야 해서
 * 기계가 판단할 일이 아니다.
 *
 * 사용: node scripts/content-check.mjs
 */
import postgres from 'postgres';

/** 한 글자만 찍어서 얻는 적중률 상한. 균등(25%)에서 이만큼까지는 눈감는다. */
const LABEL_SHARE_LIMIT = 0.35;
/** 가장 긴 보기를 찍어서 얻는 적중률. 넘으면 경고한다. */
const LENGTH_SHARE_WARN = 0.5;

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const errors = [];
const warnings = [];

const [{ n: total }] = await sql`
  select count(*)::int n from public.questions where status = 'published'
`;
if (total === 0) {
  console.error('게시된 문항이 없습니다.');
  process.exit(1);
}

// ── 1. 정답 위치 쏠림 ──────────────────────────────────────────────────
const labels = await sql`
  select o.label, count(*)::int n
    from private.question_options o
    join public.questions q on q.id = o.question_id
   where o.is_correct and q.status = 'published'
   group by 1 order by 1
`;
console.log(`[정답 위치] 게시 ${total}문항, 균등하면 각 25%`);
for (const row of labels) {
  const share = row.n / total;
  console.log(`  ${row.label} ${String(row.n).padStart(4)}  ${(100 * share).toFixed(1)}%`);
  if (share > LABEL_SHARE_LIMIT) {
    errors.push(
      `정답이 ${row.label}에 ${(100 * share).toFixed(1)}% 몰려 있다 ` +
        `(한계 ${(100 * LABEL_SHARE_LIMIT).toFixed(0)}%). ` +
        `scripts/rebalance-option-labels.mjs 로 재배치해야 한다.`,
    );
  }
}

// ── 2. 보기 길이 쏠림 ─────────────────────────────────────────────────
//
// "가장 긴 보기가 정답"을 그냥 세면 안 된다. 최장 길이가 여러 개면 찍어도
// 고를 수 없으므로 실제 이득이 아니다. **가장 긴 보기를 찍는 전략의 기대
// 적중률**을 재야 하고, 동률일 때는 그 중 하나를 무작위로 고른다고 본다.
const lengths = await sql`
  select (select length(o.option_text) from private.question_options o
           where o.question_id = q.id and o.is_correct)::int as correct_len,
         (select max(length(o.option_text)) from private.question_options o
           where o.question_id = q.id)::int as max_len,
         (select count(*) from private.question_options o
           where o.question_id = q.id
             and length(o.option_text) = (
               select max(length(o2.option_text)) from private.question_options o2
                where o2.question_id = q.id))::int as ties
    from public.questions q
   where q.status = 'published'
`;
const longestHitRate =
  lengths.reduce((sum, r) => sum + (r.correct_len === r.max_len ? 1 / r.ties : 0), 0) / total;
console.log(
  `\n[보기 길이] 가장 긴 보기를 찍는 전략의 기대 적중률 ` +
    `${(100 * longestHitRate).toFixed(1)}% (무작위 25%)`,
);
if (longestHitRate > LENGTH_SHARE_WARN) {
  warnings.push(
    `가장 긴 보기를 찍으면 ${(100 * longestHitRate).toFixed(1)}% 맞는다. ` +
      `오답을 정답과 비슷한 길이로 다시 쓰는 수밖에 없다 — 사람이 할 일이다.`,
  );
}

// ── 3. 게시 조건과 라벨 무결성 ─────────────────────────────────────────
const [{ n: broken }] = await sql`
  select count(*)::int n from public.questions q
   where q.status = 'published'
     and ((select count(*) from private.question_options o where o.question_id = q.id) <> 4
       or (select count(*) from private.question_options o
            where o.question_id = q.id and o.is_correct) <> 1
       or (select count(*) from public.question_sources s where s.question_id = q.id) = 0)
`;
if (broken > 0) errors.push(`게시 조건(보기 4·정답 1·출처 1)을 못 채운 문항 ${broken}건`);

const [{ n: dupLabel }] = await sql`
  select count(*)::int n from (
    select question_id from private.question_options
     group by question_id having count(distinct label) <> 4
  ) t
`;
if (dupLabel > 0) errors.push(`라벨이 A~D 네 개가 아닌 문항 ${dupLabel}건`);

const [{ n: dupStem }] = await sql`
  select count(*)::int n from (
    select stem from public.questions where status <> 'retired'
     group by stem having count(*) > 1
  ) t
`;
if (dupStem > 0) errors.push(`본문이 겹치는 문항 ${dupStem}건`);

// ── 4. 출처·권리 근거 ─────────────────────────────────────────────────
const [{ n: noRights }] = await sql`
  select count(*)::int n from public.question_sources s
    join public.questions q on q.id = s.question_id
   where q.status = 'published' and s.rights_note is null
`;
if (noRights > 0) errors.push(`권리 근거(rights_note)가 비어 있는 출처 ${noRights}건`);

const [{ n: cited }] = await sql`
  select count(*)::int n from public.question_sources s
    join public.questions q on q.id = s.question_id
   where q.status = 'published' and s.source_name like '2026 KBO%'
`;
console.log(`\n[출처] 조항을 특정한 문항 ${cited} / ${total} (${(100 * cited / total).toFixed(1)}%)`);
console.log(`  나머지 ${total - cited}건은 조항 미확인이다. 공식야구규칙 원문이 있어야 풀린다.`);

// ── 5. 난이도 분포 ────────────────────────────────────────────────────
const diffs = await sql`
  select difficulty, count(*)::int n from public.questions
   where status = 'published' group by 1
`;
const by = Object.fromEntries(diffs.map((r) => [r.difficulty, r.n]));
console.log('\n[난이도] 목표 40/40/20');
for (const key of ['easy', 'normal', 'hard']) {
  console.log(`  ${key.padEnd(7)} ${String(by[key] ?? 0).padStart(4)}  ${(100 * (by[key] ?? 0) / total).toFixed(1)}%`);
}
// 한 난이도가 전체보다 먼저 소진되면 그 뒤 출제가 기운다 (10 문서 §1.2.4).
for (const [key, need] of [['easy', 0.4], ['normal', 0.4], ['hard', 0.2]]) {
  if ((by[key] ?? 0) < need * total) {
    warnings.push(
      `${key} 보유 ${by[key] ?? 0}개가 출제 비중 ${100 * need}%(${Math.ceil(need * total)}개)에 못 미친다. ` +
        `긴 세션에서 먼저 소진돼 분포가 기운다.`,
    );
  }
}

console.log('');
for (const w of warnings) console.log(`경고: ${w}`);
for (const e of errors) console.error(`오류: ${e}`);

await sql.end();

if (errors.length > 0) {
  console.error(`\n오류 ${errors.length}건. 노출 전에 고쳐야 한다.`);
  process.exit(1);
}
console.log(`\n오류 0건${warnings.length ? `, 경고 ${warnings.length}건` : ''}.`);
