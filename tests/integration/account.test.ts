import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import { deleteAccount, exportAccountData } from '@/server/me/account';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import { submitAtBat } from '@/server/play/submitAtBat';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
  optionsFor,
  resetPlayData,
} from './helpers/fixtures';

/**
 * 계정 삭제와 데이터 내보내기 (08 문서 V17).
 *
 * 삭제는 되돌릴 수 없고, **남는 게 있으면 개인정보 처리방침을 지킬 수 없다**.
 * 그래서 "지워졌는지"가 아니라 "하나도 안 남았는지"를 확인한다.
 *
 * 삭제는 Auth 관리 API를 쓰므로 service_role 키가 필요하다.
 */
const hasAdminKey = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
);

describe.skipIf(!hasDatabase())('계정 데이터', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(30);
  });

  afterEach(async () => {
    await resetPlayData();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  /** 공식 경기를 끝까지 진행해 성적·XP·존 집계를 만든다. */
  async function playOfficialGame(owner: Owner) {
    const started = await startSession({ mode: 'official_3' }, owner);
    let sequence = started.atBat.sequence;
    let questionId = started.atBat.questionId;

    for (let guard = 0; guard < 40; guard += 1) {
      const fixture = await optionsFor(questionId);
      const result = await submitAtBat(
        started.sessionId,
        {
          sequence,
          // 앞 두 타석은 정답으로 — XP와 존 집계를 만들기 위해
          optionId: guard < 2 ? fixture.correctOptionId : fixture.wrongOptionIds[0]!,
          submissionId: randomUUID(),
        },
        owner,
      );
      if (result.finished) return started.sessionId;
      sequence = result.next!.sequence;
      questionId = result.next!.questionId;
    }
    throw new Error('경기가 끝나지 않았습니다');
  }

  it('내보내기에 본인 데이터가 담긴다', async () => {
    const userId = await createUser({ primaryTeamSlug: 'doosan' });
    await playOfficialGame({ kind: 'user', userId });

    const exported = await exportAccountData(userId);

    expect(exported.profile.nickname.length).toBeGreaterThan(0);
    expect(exported.profile.primaryTeamName).toBe('두산 베어스');
    expect(exported.battingStats.length).toBeGreaterThan(0);
    expect(exported.sessions.length).toBe(1);
    expect(exported.atBats.length).toBeGreaterThan(0);
    expect(exported.xpLedger.length).toBeGreaterThan(0);
    expect(exported.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('내보내기에 다른 회원의 정보가 섞이지 않는다', async () => {
    const mine = await createUser();
    const other = await createUser();
    await playOfficialGame({ kind: 'user', userId: mine });
    await playOfficialGame({ kind: 'user', userId: other });

    const exported = await exportAccountData(mine);
    const serialized = JSON.stringify(exported);

    expect(exported.sessions.length).toBe(1);
    expect(serialized).not.toContain(other);
  });

  describe.skipIf(!hasAdminKey)('삭제', () => {
    it('계정과 딸린 개인 데이터가 하나도 남지 않는다', async () => {
      const userId = await createUser({ primaryTeamSlug: 'lg' });
      await playOfficialGame({ kind: 'user', userId });

      const db = getDb();

      // 삭제 전: 데이터가 실제로 쌓였는지 먼저 확인한다.
      const before = await countAll(db, userId);
      expect(before.profiles).toBe(1);
      expect(before.sessions).toBeGreaterThan(0);
      expect(before.atBats).toBeGreaterThan(0);
      expect(before.battingStats).toBeGreaterThan(0);
      expect(before.xp).toBeGreaterThan(0);
      expect(before.privateStats).toBe(1);

      const result = await deleteAccount(userId);
      expect(result.deleted).toBe(true);

      const after = await countAll(db, userId);
      expect(after).toEqual({
        authUsers: 0,
        profiles: 0,
        sessions: 0,
        atBats: 0,
        battingStats: 0,
        xp: 0,
        zoneCells: 0,
        privateStats: 0,
        favoriteTeams: 0,
      });
    });

    it('승계했던 게스트 세션은 지워지지 않고 익명화된다', async () => {
      const tokenHash = `claim-${randomUUID()}`;
      const guestOwner: Owner = { kind: 'guest', tokenHash };

      // 게스트로 체험 1이닝을 끝낸 뒤 승계한다.
      const started = await startSession({ mode: 'trial' }, guestOwner);
      let sequence = started.atBat.sequence;
      let questionId = started.atBat.questionId;
      for (let i = 0; i < 20; i += 1) {
        const fixture = await optionsFor(questionId);
        const result = await submitAtBat(
          started.sessionId,
          {
            sequence,
            optionId: fixture.wrongOptionIds[0]!,
            submissionId: randomUUID(),
          },
          guestOwner,
        );
        if (result.finished) break;
        sequence = result.next!.sequence;
        questionId = result.next!.questionId;
      }

      const userId = await createUser();
      await claimGuestSessions(userId, tokenHash);

      const db = getDb();
      const [claimed] = await db<{ claimed_by: string | null }[]>`
        select claimed_by from public.guest_sessions where token_hash = ${tokenHash}
      `;
      expect(claimed?.claimed_by).toBe(userId);

      await deleteAccount(userId);

      // 행 자체는 남고 승계자만 비워진다 — 체험 상한 집계는 유지되어야 한다.
      const [afterDelete] = await db<{ claimed_by: string | null; claimed_at: Date | null }[]>`
        select claimed_by, claimed_at from public.guest_sessions where token_hash = ${tokenHash}
      `;
      expect(afterDelete).toBeDefined();
      expect(afterDelete?.claimed_by).toBeNull();
      // 0012 로 완화한 제약 덕분에 claimed_at 은 남아도 된다.
      expect(afterDelete?.claimed_at).not.toBeNull();
    });
  });
});

async function countAll(db: ReturnType<typeof getDb>, userId: string) {
  const one = async (query: Promise<{ c: number }[]>) => (await query)[0]?.c ?? 0;

  return {
    authUsers: await one(db`select count(*)::int c from auth.users where id = ${userId}`),
    profiles: await one(db`select count(*)::int c from public.profiles where id = ${userId}`),
    sessions: await one(
      db`select count(*)::int c from public.play_sessions where user_id = ${userId}`,
    ),
    atBats: await one(db`
      select count(*)::int c from public.at_bats ab
       join public.play_sessions s on s.id = ab.session_id
      where s.user_id = ${userId}
    `),
    battingStats: await one(
      db`select count(*)::int c from public.user_batting_stats where user_id = ${userId}`,
    ),
    xp: await one(
      db`select count(*)::int c from public.xp_transactions where user_id = ${userId}`,
    ),
    zoneCells: await one(
      db`select count(*)::int c from public.user_zone_cells where user_id = ${userId}`,
    ),
    privateStats: await one(
      db`select count(*)::int c from public.user_private_stats where user_id = ${userId}`,
    ),
    favoriteTeams: await one(
      db`select count(*)::int c from public.user_favorite_teams where user_id = ${userId}`,
    ),
  };
}
