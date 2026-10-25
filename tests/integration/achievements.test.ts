import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import type { AtBatResult } from '@/lib/engine';
import { getAchievements } from '@/server/me/achievements';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
  resetPlayData,
} from './helpers/fixtures';

/**
 * 업적 카드 조회 (14 문서 §5.2) — 원장에서 **본인 것만** 읽는지, 결과가
 * 확정되지 않은 타석을 빼는지, 획득일을 KST로 주는지.
 */
describe.skipIf(!hasDatabase())('업적 카드 조회', () => {
  let questionIds: string[] = [];

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    questionIds = [...(await createQuestionPool(6)).keys()];
  });

  afterEach(async () => {
    await resetPlayData();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  /** 끝난 경기 하나와 그 타석들을 원장에 직접 넣는다. */
  async function insertGame(
    userId: string,
    plays: { result: AtBatResult | null; rbi?: number; submittedAt?: string }[],
  ): Promise<string> {
    const db = getDb();
    const [session] = await db<{ id: string }[]>`
      insert into public.play_sessions (user_id, mode, status, ended_at)
      values (${userId}, 'official_3', 'finished', now())
      returning id
    `;

    for (const [index, play] of plays.entries()) {
      const submittedAt = play.submittedAt ?? new Date().toISOString();
      const resolved = play.result !== null;
      await db`
        insert into public.at_bats (
          session_id, sequence, question_id, inning, outs_before, bases_before,
          opened_at, deadline_at,
          submitted_at, elapsed_ms, is_correct, result, rbi, bases_after
        )
        values (
          ${session!.id}, ${index + 1}, ${questionIds[index]!}, 1, 0, 0,
          ${submittedAt}::timestamptz - interval '5 seconds',
          ${submittedAt}::timestamptz + interval '10 seconds',
          ${resolved ? submittedAt : null}, ${resolved ? 3000 : null},
          ${resolved ? play.result !== 'K' : null},
          ${play.result}::public.at_bat_result, ${play.rbi ?? 0},
          ${resolved ? 0 : null}
        )
      `;
    }
    return session!.id;
  }

  const byId = (list: Awaited<ReturnType<typeof getAchievements>>, id: string) =>
    list.find((achievement) => achievement.id === id)!;

  it('기록이 없는 회원은 모든 카드가 미획득이다', async () => {
    const userId = await createUser();
    const list = await getAchievements(getDb(), userId);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((achievement) => !achievement.earned)).toBe(true);
  });

  it('홈런을 치면 첫 안타·첫 홈런을 얻고, 날짜는 KST다', async () => {
    const userId = await createUser();
    // UTC 10월 25일 16:30 = KST 10월 26일 01:30
    await insertGame(userId, [{ result: 'HR', rbi: 1, submittedAt: '2026-10-25T16:30:00Z' }]);

    const list = await getAchievements(getDb(), userId);
    expect(byId(list, 'first_hit')).toMatchObject({ earned: true, earnedOn: '2026-10-26' });
    expect(byId(list, 'first_hr')).toMatchObject({ earned: true, earnedOn: '2026-10-26' });
    expect(byId(list, 'cycle').earned).toBe(false);
  });

  it('다른 회원의 기록은 세지 않는다', async () => {
    const me = await createUser();
    const other = await createUser();
    await insertGame(other, [{ result: 'HR' }]);

    const list = await getAchievements(getDb(), me);
    expect(byId(list, 'first_hr').earned).toBe(false);
  });

  it('결과가 확정되지 않은 타석은 세지 않는다', async () => {
    const userId = await createUser();
    await insertGame(userId, [{ result: 'K' }, { result: null }]);

    const list = await getAchievements(getDb(), userId);
    expect(byId(list, 'first_hit').earned).toBe(false);
  });

  it('한 경기 사이클링 히트와 빅 이닝을 원장에서 찾는다', async () => {
    const userId = await createUser();
    await insertGame(userId, [
      { result: '1B' },
      { result: '2B', rbi: 1 },
      { result: '3B', rbi: 1 },
      { result: 'HR', rbi: 3 },
    ]);

    const list = await getAchievements(getDb(), userId);
    expect(byId(list, 'cycle').earned).toBe(true);
    expect(byId(list, 'big_inning').earned).toBe(true);
  });

  it('Lv.7이면 명예의 전당 카드를 얻고 날짜는 비운다', async () => {
    const userId = await createUser();
    await getDb()`
      insert into public.user_private_stats (user_id, level) values (${userId}, 7)
      on conflict (user_id) do update set level = 7
    `;

    const list = await getAchievements(getDb(), userId);
    expect(byId(list, 'hall_of_fame')).toMatchObject({ earned: true, earnedOn: null });
  });
});
