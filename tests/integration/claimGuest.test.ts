import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import { submitAtBat } from '@/server/play/submitAtBat';
import {
  assertLocalDatabase,
  cleanup,
  createAuthUser,
  createQuestionPool,
  hasDatabase,
  type QuestionFixture,
} from './helpers/fixtures';

/**
 * 09 문서 §7.2 TC-CLAIM-01/02 — 게스트 기록 승계.
 * 출시 게이트 G7: 동일 토큰 반복·동시 호출에서 기록 중복 0.
 */
describe.skipIf(!hasDatabase())('게스트 기록 승계', () => {
  let pool: Map<string, QuestionFixture>;

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    pool = await createQuestionPool(30);
  });

  afterEach(async () => {
    const db = getDb();
    await db`delete from public.at_bats`;
    await db`delete from public.play_sessions`;
    await db`delete from public.user_batting_stats`;
    await db`delete from public.user_zone_cells`;
    await db`delete from public.user_private_stats`;
    await db`delete from public.guest_sessions`;
    await db`delete from public.profiles`;
    await db`delete from auth.users where email like '%@example.test'`;
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  /** 체험 1이닝을 끝까지 진행한다(전부 오답 → 3아웃). */
  async function playTrialToEnd(owner: Owner) {
    const started = await startSession({ mode: 'trial' }, owner);
    let sequence = started.atBat.sequence;
    let questionId = started.atBat.questionId;

    for (let guard = 0; guard < 20; guard += 1) {
      const fixture = pool.get(questionId)!;
      const result = await submitAtBat(
        started.sessionId,
        {
          sequence,
          optionId: fixture.wrongOptionIds[0]!,
          submissionId: randomUUID(),
        },
        owner,
      );
      if (result.finished) return started.sessionId;
      sequence = result.next!.sequence;
      questionId = result.next!.questionId;
    }
    throw new Error('체험 경기가 끝나지 않았습니다');
  }

  it('TC-CLAIM-01: 두 번 호출해도 중복 적립되지 않는다', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    const owner: Owner = { kind: 'guest', tokenHash };
    await playTrialToEnd(owner);

    const userId = await createAuthUser();

    const first = await claimGuestSessions(userId, tokenHash);
    expect(first.alreadyClaimed).toBe(false);
    expect(first.claimedSessions).toBe(1);
    expect(first.migrated.pa).toBeGreaterThan(0);
    expect(first.career?.pa).toBe(first.migrated.pa);

    const second = await claimGuestSessions(userId, tokenHash);
    expect(second.alreadyClaimed).toBe(true);
    expect(second.claimedSessions).toBe(0);

    const db = getDb();
    const [career] = await db<{ pa: number }[]>`
      select pa from public.user_batting_stats
       where user_id = ${userId} and season_id is null
    `;
    expect(career?.pa).toBe(first.migrated.pa);
  });

  it('TC-CLAIM-02: 동시에 두 번 호출해도 집계는 1회', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    const owner: Owner = { kind: 'guest', tokenHash };
    await playTrialToEnd(owner);

    const userId = await createAuthUser();

    const results = await Promise.allSettled([
      claimGuestSessions(userId, tokenHash),
      claimGuestSessions(userId, tokenHash),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(2);

    const db = getDb();
    const [rows] = await db<{ count: string }[]>`
      select count(*)::text as count
        from public.user_batting_stats
       where user_id = ${userId} and season_id is null
    `;
    expect(rows?.count).toBe('1');

    const claimedCount = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof claimGuestSessions>>> =>
        r.status === 'fulfilled',
      )
      .filter((r) => r.value.claimedSessions > 0).length;
    expect(claimedCount).toBe(1);
  });

  it('프로필이 없으면 승계가 만들어 준다', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    await playTrialToEnd({ kind: 'guest', tokenHash });
    const userId = await createAuthUser();

    await claimGuestSessions(userId, tokenHash);

    const db = getDb();
    const [profile] = await db<{ nickname: string; onboarding_status: string }[]>`
      select nickname, onboarding_status from public.profiles where id = ${userId}
    `;
    expect(profile?.nickname.length).toBeGreaterThanOrEqual(2);
    expect(profile?.onboarding_status).toBe('pending');
  });

  it('경기 소유권이 회원으로 넘어간다', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    const sessionId = await playTrialToEnd({ kind: 'guest', tokenHash });
    const userId = await createAuthUser();

    await claimGuestSessions(userId, tokenHash);

    const db = getDb();
    const [session] = await db<{ user_id: string | null; guest_session_id: string | null }[]>`
      select user_id, guest_session_id from public.play_sessions where id = ${sessionId}
    `;
    expect(session?.user_id).toBe(userId);
    expect(session?.guest_session_id).toBeNull();
  });

  it('체험 승계는 XP를 주지 않는다', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    await playTrialToEnd({ kind: 'guest', tokenHash });
    const userId = await createAuthUser();

    await claimGuestSessions(userId, tokenHash);

    const db = getDb();
    const [xp] = await db<{ count: string }[]>`
      select count(*)::text as count from public.xp_transactions where user_id = ${userId}
    `;
    expect(xp?.count).toBe('0');
  });

  it('게스트 세션이 없으면 빈 결과를 돌려준다', async () => {
    const userId = await createAuthUser();
    const result = await claimGuestSessions(userId, `missing-${randomUUID()}`);
    expect(result).toMatchObject({ alreadyClaimed: false, claimedSessions: 0 });
    expect(result.migrated.pa).toBe(0);
  });

  it('다른 계정이 이미 가져간 토큰은 옮기지 않는다', async () => {
    const tokenHash = `claim-${randomUUID()}`;
    await playTrialToEnd({ kind: 'guest', tokenHash });

    const firstUser = await createAuthUser();
    const secondUser = await createAuthUser();

    await claimGuestSessions(firstUser, tokenHash);
    const second = await claimGuestSessions(secondUser, tokenHash);

    expect(second.alreadyClaimed).toBe(true);
    expect(second.claimedSessions).toBe(0);

    const db = getDb();
    const [stats] = await db<{ count: string }[]>`
      select count(*)::text as count
        from public.user_batting_stats where user_id = ${secondUser}
    `;
    expect(stats?.count).toBe('0');
  });
});
