import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { buildBoxScore } from '@/lib/engine';
import type { AtBatEntry, AtBatResult } from '@/lib/engine';
import { getBoxScore } from '@/server/play/getState';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import { submitAtBat } from '@/server/play/submitAtBat';
import { grantXp } from '@/server/xp/grant';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
  setElapsed,
  type QuestionFixture,
} from './helpers/fixtures';

/** 09 문서 §7.2 — XP 멱등 지급과 통산 성적 집계. */
describe.skipIf(!hasDatabase())('XP 지급과 성적 집계', () => {
  let pool: Map<string, QuestionFixture>;

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    pool = await createQuestionPool(40);
  });

  afterEach(async () => {
    const db = getDb();
    await db`delete from public.at_bats`;
    await db`delete from public.play_sessions`;
    await db`delete from public.xp_transactions`;
    await db`delete from public.user_batting_stats`;
    await db`delete from public.user_zone_cells`;
    await db`delete from public.user_private_stats`;
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  /** 공식 3이닝을 끝까지 진행한다. plan은 타석별 정답 여부와 경과시간. */
  async function playOfficialGame(
    owner: Owner,
    plan: { correct: boolean; elapsedMs?: number }[],
  ) {
    const started = await startSession({ mode: 'official_3' }, owner);
    const entries: AtBatEntry[] = [];
    let sequence = started.atBat.sequence;
    let questionId = started.atBat.questionId;
    let index = 0;
    let finish: Awaited<ReturnType<typeof submitAtBat>>['finish'] = null;

    // 3이닝 = 아웃 9개. 계획이 끝나면 모두 오답으로 채워 경기를 닫는다.
    for (let guard = 0; guard < 200; guard += 1) {
      const fixture = pool.get(questionId)!;
      const step = plan[index] ?? { correct: false };
      index += 1;

      if (step.elapsedMs !== undefined) {
        await setElapsed(started.sessionId, sequence, step.elapsedMs);
      }

      const result = await submitAtBat(
        started.sessionId,
        {
          sequence,
          optionId: step.correct ? fixture.correctOptionId : fixture.wrongOptionIds[0]!,
          submissionId: randomUUID(),
        },
        owner,
      );

      entries.push({ result: result.result as AtBatResult, rbi: result.rbi });

      if (result.finished) {
        finish = result.finish;
        break;
      }
      sequence = result.next!.sequence;
      questionId = result.next!.questionId;
    }

    return { sessionId: started.sessionId, entries, finish };
  }

  it('TC-XP-01: 같은 이벤트를 두 번 지급해도 원장에 한 번만 쌓인다', async () => {
    const userId = await createUser();
    const db = getDb();
    const entityId = randomUUID();

    const first = await grantXp(db, {
      userId,
      reason: 'inning_complete',
      entityId,
      amount: 20,
    });
    const second = await grantXp(db, {
      userId,
      reason: 'inning_complete',
      entityId,
      amount: 20,
    });

    expect(first).toMatchObject({ granted: true, amount: 20 });
    expect(second).toMatchObject({ granted: false, reason: 'duplicate' });

    const [counted] = await db<{ count: string; sum: string | null }[]>`
      select count(*)::text as count, sum(amount)::text as sum
        from public.xp_transactions
       where user_id = ${userId}
    `;
    expect(counted?.count).toBe('1');
    expect(counted?.sum).toBe('20');
  });

  it('일일 상한을 넘으면 지급하지 않는다', async () => {
    const userId = await createUser();
    const db = getDb();

    for (let i = 0; i < 5; i += 1) {
      const granted = await grantXp(db, {
        userId,
        reason: 'inning_complete',
        entityId: randomUUID(),
        amount: 20,
        dailyCap: 5,
      });
      expect(granted.granted).toBe(true);
    }

    const sixth = await grantXp(db, {
      userId,
      reason: 'inning_complete',
      entityId: randomUUID(),
      amount: 20,
      dailyCap: 5,
    });
    expect(sixth).toMatchObject({ granted: false, reason: 'daily_cap' });
  });

  it('공식 경기를 끝내면 XP와 누적 레벨이 갱신된다', async () => {
    const userId = await createUser();
    const owner: Owner = { kind: 'user', userId };

    // 2타석 정답(각 +10) + 이닝 완료(+20)
    const { finish } = await playOfficialGame(owner, [
      { correct: true, elapsedMs: 3000 },
      { correct: true, elapsedMs: 3000 },
    ]);

    expect(finish?.recorded).toBe(true);
    expect(finish?.xpEarned).toBe(10 + 10 + 20);
    expect(finish?.level).toBe(1);

    const db = getDb();
    const [stats] = await db<{ total_xp: string; total_games: number }[]>`
      select total_xp::text as total_xp, total_games
        from public.user_private_stats
       where user_id = ${userId}
    `;
    expect(stats?.total_xp).toBe('40');
    expect(stats?.total_games).toBe(1);
  });

  it('TC-STATS-01: 통산 성적이 원장 재집계 결과와 일치한다', async () => {
    const userId = await createUser();
    const owner: Owner = { kind: 'user', userId };

    const { sessionId, entries } = await playOfficialGame(owner, [
      { correct: true, elapsedMs: 1000 }, // 홈런
      { correct: true, elapsedMs: 3000 }, // 2루타
      { correct: true, elapsedMs: 6000 }, // 단타
      { correct: true, elapsedMs: 10000 }, // 볼넷
    ]);

    const expected = buildBoxScore(entries);
    const api = await getBoxScore(sessionId, owner);
    expect(api.boxScore).toEqual(expected);

    const db = getDb();
    const [career] = await db<
      { pa: number; ab: number; h: number; hr: number; bb: number; so: number }[]
    >`
      select pa, ab, h, hr, bb, so
        from public.user_batting_stats
       where user_id = ${userId}
         and season_id is null
    `;

    expect(career).toMatchObject({
      pa: expected.pa,
      ab: expected.ab,
      h: expected.h,
      hr: expected.hr,
      bb: expected.bb,
      so: expected.so,
    });
  });

  it('통산 행이 중복 생성되지 않는다 (season_id null 부분 유니크)', async () => {
    const userId = await createUser();
    const owner: Owner = { kind: 'user', userId };

    await playOfficialGame(owner, [{ correct: true, elapsedMs: 3000 }]);
    await playOfficialGame(owner, [{ correct: true, elapsedMs: 3000 }]);

    const db = getDb();
    const [counted] = await db<{ count: string }[]>`
      select count(*)::text as count
        from public.user_batting_stats
       where user_id = ${userId}
         and season_id is null
    `;
    expect(counted?.count).toBe('1');

    const [career] = await db<{ total_games: number }[]>`
      select total_games from public.user_private_stats where user_id = ${userId}
    `;
    expect(career?.total_games).toBe(2);
  });

  it('존 히트맵 집계가 누적된다', async () => {
    const userId = await createUser();
    const owner: Owner = { kind: 'user', userId };

    await playOfficialGame(owner, [{ correct: true, elapsedMs: 3000 }]);

    const db = getDb();
    const [sums] = await db<{ attempts: string; correct: string }[]>`
      select sum(attempts)::text as attempts, sum(correct)::text as correct
        from public.user_zone_cells
       where user_id = ${userId}
    `;
    expect(Number(sums?.attempts ?? '0')).toBeGreaterThan(0);
    expect(Number(sums?.correct ?? '0')).toBeGreaterThanOrEqual(1);
  });
});
