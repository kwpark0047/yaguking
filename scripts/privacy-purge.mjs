// 보관 기간이 지난 개인정보를 지운다 (0016, 15 문서 §2). 하루 한 번 실행한다.
// 기간은 DB 함수의 기본값을 쓴다 — 단일 출처는 src/lib/privacy/retention.ts.
//
//   npm run privacy:purge
//
// 지운 행 수만 출력한다. 지운 내용(이메일·주소 등)은 남기지 않는다.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const [row] = await sql`select * from public.purge_expired_personal_data()`;
  console.log(
    `[privacy:purge] 비회원 ${row.purged_guests} · 로그인 기록 ${row.purged_auth_logs} · ` +
      `세션 ${row.purged_sessions} · 레이트 리밋 ${row.purged_rate_limits}`,
  );
} catch (error) {
  console.error(`[privacy:purge] 실패: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
