import { after } from 'next/server';
import { getDb } from '@/lib/db/sql';
import type { Queryable } from '@/lib/db/types';

/**
 * 보관 기간 파기의 **안전망** (0016·0017, 15 문서 §2.3).
 *
 * 원칙은 운영자가 하루 한 번 `npm run privacy:purge`를 돌리는 것이다(OPERATIONS.md).
 * 그걸 빠뜨려도 처리방침의 "매일 자동으로 삭제"가 거짓이 되지 않도록, 경기를
 * 시작할 때 마지막 실행이 하루를 넘었으면 응답을 보낸 **뒤에** 한 번 돌린다.
 *
 *   - 여러 인스턴스가 동시에 돌리지 않는다: `maintenance_runs`의 조건부 갱신을
 *     통과한 한 곳만 실행한다
 *   - 매 요청 DB를 두드리지 않는다: 같은 프로세스에서는 10분에 한 번만 확인한다
 *   - 실패해도 경기와 무관하다: 기록만 남기고 다음 확인 때 다시 시도한다
 *
 * 방문이 전혀 없는 날에는 돌지 않는다. 그런 날은 새로 쌓이는 정보도 없고, 다음
 * 방문 때 밀린 분량을 한 번에 지운다. 정시 실행이 필요하면 크론을 건다.
 */

const JOB = 'privacy_purge';
const CHECK_EVERY_MS = 10 * 60 * 1000;
let lastCheckedAt = 0;

/** 테스트용: 프로세스 안의 확인 간격을 초기화한다. */
export function resetPurgeCheckForTest(): void {
  lastCheckedAt = 0;
}

/** 하루가 지났으면 파기를 돌리고 true. 이번에 돌 차례가 아니면 false. */
export async function maybeRunDailyPurge(
  db: Queryable = getDb(),
  now: number = Date.now(),
): Promise<boolean> {
  if (now - lastCheckedAt < CHECK_EVERY_MS) return false;
  lastCheckedAt = now;

  const claimed = await db<{ job: string }[]>`
    insert into public.maintenance_runs (job, last_run_at)
    values (${JOB}, now())
    on conflict (job) do update
       set last_run_at = excluded.last_run_at
     where public.maintenance_runs.last_run_at < now() - interval '1 day'
    returning job
  `;
  if (claimed.length === 0) return false;

  const [row] = await db<
    { purged_guests: number; purged_auth_logs: number; purged_sessions: number; purged_rate_limits: number }[]
  >`select * from public.purge_expired_personal_data()`;
  // 운영 로그에 남기려는 것이다(이 저장소는 warn·error만 허용한다).
  console.warn(
    `[privacy:purge] 자동 실행 — 비회원 ${row?.purged_guests ?? 0} · 로그인 기록 ${row?.purged_auth_logs ?? 0} · ` +
      `세션 ${row?.purged_sessions ?? 0} · 레이트 리밋 ${row?.purged_rate_limits ?? 0}`,
  );
  return true;
}

/** 응답을 보낸 뒤 안전망을 한 번 확인한다. 라우트 핸들러·서버 컴포넌트에서 부른다. */
export function scheduleDailyPurge(): void {
  after(async () => {
    try {
      await maybeRunDailyPurge();
    } catch (error) {
      console.error(
        `[privacy:purge] 자동 실행 실패: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  });
}
