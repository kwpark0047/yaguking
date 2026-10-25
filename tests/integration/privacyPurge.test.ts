import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import {
  AUTH_LOG_RETENTION_DAYS,
  GUEST_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_HOURS,
} from '@/lib/privacy/retention';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
  resetPlayData,
} from './helpers/fixtures';

/**
 * 보관 기간 경과분 파기 (0016, 15 문서 §2).
 *
 * 처리방침(/privacy)에 적은 기간이 **실제로 지켜지는지** 본다. 기간 숫자는
 * src/lib/privacy/retention.ts가 단일 출처이고 DB 함수 기본값과 같아야 한다.
 */
describe.skipIf(!hasDatabase())('개인정보 보관 기간 파기', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(10);
  });

  afterEach(async () => {
    await resetPlayData();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  const purge = async () => {
    const [row] = await getDb()<
      {
        purged_guests: number;
        purged_auth_logs: number;
        purged_sessions: number;
        purged_rate_limits: number;
      }[]
    >`select * from public.purge_expired_personal_data()`;
    return row!;
  };

  /** 게스트를 만들고 경기를 하나 연 뒤, 모든 시각을 `daysAgo`일 전으로 민다. */
  async function guestWithGame(daysAgo: number) {
    const owner: Owner = { kind: 'guest', tokenHash: `test-${randomUUID()}` };
    const started = await startSession({ mode: 'trial' }, owner);
    const db = getDb();
    const shift = `${daysAgo} days`;
    await db`
      update public.guest_sessions
         set created_at = now() - ${shift}::interval,
             day_key = (now() - ${shift}::interval)::date
       where token_hash = ${owner.kind === 'guest' ? owner.tokenHash : ''}
    `;
    await db`
      update public.play_sessions
         set started_at = now() - ${shift}::interval, ended_at = null
       where id = ${started.sessionId}
    `;
    return { owner, sessionId: started.sessionId };
  }

  const guestExists = async (tokenHash: string) =>
    (await getDb()`select 1 from public.guest_sessions where token_hash = ${tokenHash}`).length > 0;
  const sessionExists = async (id: string) =>
    (await getDb()`select 1 from public.play_sessions where id = ${id}`).length > 0;

  it('DB 함수의 기본 기간이 처리방침의 숫자(retention.ts)와 같다', async () => {
    const [row] = await getDb()<{ args: string }[]>`
      select pg_get_function_arguments('public.purge_expired_personal_data(integer, integer, integer)'::regprocedure) as args
    `;
    expect(row!.args).toContain(`p_guest_days integer DEFAULT ${GUEST_RETENTION_DAYS}`);
    expect(row!.args).toContain(`p_auth_log_days integer DEFAULT ${AUTH_LOG_RETENTION_DAYS}`);
    expect(row!.args).toContain(`p_rate_limit_hours integer DEFAULT ${RATE_LIMIT_RETENTION_HOURS}`);
  });

  it(`마지막 이용이 ${GUEST_RETENTION_DAYS}일을 넘은 비회원 기록은 경기·타석까지 지운다`, async () => {
    const old = await guestWithGame(GUEST_RETENTION_DAYS + 1);
    const recent = await guestWithGame(GUEST_RETENTION_DAYS - 1);
    const tokenOf = (owner: Owner) => (owner.kind === 'guest' ? owner.tokenHash : '');

    await purge();

    expect(await guestExists(tokenOf(old.owner))).toBe(false);
    expect(await sessionExists(old.sessionId)).toBe(false);
    expect(await guestExists(tokenOf(recent.owner))).toBe(true);
    expect(await sessionExists(recent.sessionId)).toBe(true);
  });

  it('오래전 게스트라도 최근에 경기를 했으면 남긴다 — 기준은 마지막 이용', async () => {
    const guest = await guestWithGame(GUEST_RETENTION_DAYS + 10);
    await getDb()`update public.play_sessions set started_at = now() where id = ${guest.sessionId}`;

    await purge();

    expect(await sessionExists(guest.sessionId)).toBe(true);
  });

  it('가입하며 승계한 경기는 게스트 행이 지워져도 회원 기록으로 남는다', async () => {
    const guest = await guestWithGame(GUEST_RETENTION_DAYS + 1);
    const userId = await createUser();
    // 승계: 경기 소유를 회원으로 옮기고 게스트 행에 승계 표시(claimGuestSessions와 같은 결과)
    await getDb()`
      update public.play_sessions set user_id = ${userId}, guest_session_id = null
       where id = ${guest.sessionId}
    `;
    await getDb()`
      update public.guest_sessions set claimed_by = ${userId}, claimed_at = now() - interval '40 days'
       where token_hash = ${guest.owner.kind === 'guest' ? guest.owner.tokenHash : ''}
    `;

    await purge();

    expect(await sessionExists(guest.sessionId)).toBe(true);
  });

  it(`${AUTH_LOG_RETENTION_DAYS}일 지난 로그인 기록만 지운다`, async () => {
    const db = getDb();
    const oldId = randomUUID();
    const recentId = randomUUID();
    await db`
      insert into auth.audit_log_entries (id, payload, created_at, ip_address)
      values (${oldId}, '{"action":"test"}'::json, now() - ${`${AUTH_LOG_RETENTION_DAYS + 1} days`}::interval, '127.0.0.1'),
             (${recentId}, '{"action":"test"}'::json, now() - interval '1 day', '127.0.0.1')
    `;

    await purge();

    const left = await db<{ id: string }[]>`
      select id from auth.audit_log_entries where id in (${oldId}, ${recentId})
    `;
    expect(left.map((row) => row.id)).toEqual([recentId]);
    await db`delete from auth.audit_log_entries where id = ${recentId}`;
  });

  it(`${RATE_LIMIT_RETENTION_HOURS}시간 지난 레이트 리밋 카운터를 지운다`, async () => {
    const db = getDb();
    const subject = `test-${randomUUID()}`;
    await db`
      insert into public.rate_limit_counters (bucket, subject, window_start, hits)
      values ('test', ${subject}, now() - interval '2 hours', 1),
             ('test', ${subject}, now(), 1)
    `;

    await purge();

    const left = await db`select 1 from public.rate_limit_counters where subject = ${subject}`;
    expect(left).toHaveLength(1);
    await db`delete from public.rate_limit_counters where subject = ${subject}`;
  });

  it('여러 번 돌려도 같다 — 두 번째는 지울 것이 없다', async () => {
    await guestWithGame(GUEST_RETENTION_DAYS + 1);
    const first = await purge();
    const second = await purge();
    expect(first.purged_guests).toBeGreaterThanOrEqual(1);
    expect(second.purged_guests).toBe(0);
  });

  it('클라이언트 역할(anon·authenticated)은 부를 수 없다', async () => {
    const [row] = await getDb()<{ anon: boolean; authed: boolean }[]>`
      select has_function_privilege('anon', 'public.purge_expired_personal_data(integer, integer, integer)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.purge_expired_personal_data(integer, integer, integer)', 'execute') as authed
    `;
    expect(row).toEqual({ anon: false, authed: false });
  });
});
