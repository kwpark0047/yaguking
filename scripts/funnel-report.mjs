/**
 * P1 퍼널 집계.
 *
 * **새로 수집하는 것은 없다.** 이미 저장되는 상태 테이블
 * (`guest_sessions`, `play_sessions`, `profiles`)만 읽어 단계별 수치를 낸다.
 * 소규모 노출의 목적이 "결과 저장 시점에 가입으로 넘어가는 비율"을 재는
 * 것이므로, 그 비율을 추적 이벤트 없이 낼 수 있는 데까지 낸다.
 *
 * 못 재는 것이 있다. 아래 §미측정 참고 — 특히 **게이트를 보고 가입을
 * 시작했지만 끝내지 않은 사람**은 이 방식으로 구분할 수 없다.
 *
 * 사용:
 *   node scripts/funnel-report.mjs            # 전체 기간
 *   node scripts/funnel-report.mjs --days 7   # 최근 7일
 */
import postgres from 'postgres';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const days = Number(arg('days', '0'));
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const since = days > 0 ? sql`and s.started_at >= now() - ${`${days} days`}::interval` : sql``;
const sinceGuest = days > 0 ? sql`and g.created_at >= now() - ${`${days} days`}::interval` : sql``;
const sinceProfile = days > 0 ? sql`and p.created_at >= now() - ${`${days} days`}::interval` : sql``;

const [guests] = await sql`
  select count(*)::int n from public.guest_sessions g where true ${sinceGuest}
`;
const [started] = await sql`
  select count(*)::int n from public.play_sessions s
   where s.guest_session_id is not null ${since}
`;
const [finished] = await sql`
  select count(*)::int n from public.play_sessions s
   where s.guest_session_id is not null and s.status = 'finished' ${since}
`;
const [claimed] = await sql`
  select count(*)::int n from public.guest_sessions g
   where g.claimed_by is not null ${sinceGuest}
`;
const [profiles] = await sql`
  select count(*)::int n from public.profiles p where true ${sinceProfile}
`;

const pct = (a, b) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`);
const row = (label, n, base) =>
  `  ${label.padEnd(26)} ${String(n).padStart(6)}   ${base === null ? '' : pct(n, base)}`;

console.log(days > 0 ? `[P1 퍼널 · 최근 ${days}일]` : '[P1 퍼널 · 전체 기간]');
console.log(row('게스트 발급', guests.n, null));
console.log(row('체험 경기 시작', started.n, guests.n));
console.log(row('경기 완료(결과 화면 도달)', finished.n, started.n));
console.log(row('가입 완료(프로필 생성)', profiles.n, finished.n));
console.log(row('게스트 기록 승계', claimed.n, profiles.n));
console.log('');
console.log('  ※ 끝 열은 바로 윗 단계 대비 비율이다.');

const [abandoned] = await sql`
  select count(*)::int n from public.play_sessions s
   where s.guest_session_id is not null and s.status = 'active' ${since}
`;
console.log('');
console.log('[이탈]');
console.log(row('시작했으나 미완료', abandoned.n, started.n));

const atBats = await sql`
  select coalesce(count(ab.id), 0)::int n
    from public.play_sessions s
    left join public.at_bats ab on ab.session_id = s.id
   where s.guest_session_id is not null and s.status = 'active' ${since}
`;
console.log(`  미완료 세션이 소화한 타석 합계: ${atBats[0].n}`);

console.log('');
console.log('[미측정 — 이 방식으로는 낼 수 없는 수치]');
console.log('  · 결과 화면을 보고 가입 버튼을 눌렀으나 완료하지 않은 수');
console.log('    (매직링크 요청은 어디에도 남지 않는다)');
console.log('  · 게이트를 닫고 계속 논 사람 / 그냥 떠난 사람의 구분');
console.log('  · 유입 경로(어디서 들어왔는지)');
console.log('  `growth_events` 테이블은 있지만 **기록하는 코드가 없다.**');
console.log('  이 셋을 재려면 이벤트 적재를 붙여야 하고, 그건 개인정보 처리방침에');
console.log('  적을 내용이 늘어난다는 뜻이다 — 노출 전에 정할 일이다.');

await sql.end();
