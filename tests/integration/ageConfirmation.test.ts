import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import { confirmAge, isAgeConfirmed, requireAgeConfirmed } from '@/server/me/age';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import {
  assertLocalDatabase,
  cleanup,
  createAuthUser,
  createQuestionPool,
  createUser,
  hasDatabase,
  resetPlayData,
} from './helpers/fixtures';

/**
 * 만 14세 확인 (0017, src/server/me/age.ts, 15 문서 §3).
 *
 * 확인 전 회원에게는 **기록이 쌓이지 않아야** 한다 — 화면을 건너뛰어도 서버가 막는다.
 */
describe.skipIf(!hasDatabase())('만 14세 확인', () => {
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

  it('확인 전 회원은 공식 경기를 시작할 수 없다', async () => {
    const owner: Owner = { kind: 'user', userId: await createUser({ ageConfirmed: false }) };
    await expect(startSession({ mode: 'official_3' }, owner)).rejects.toMatchObject({
      code: 'AGE_CONFIRMATION_REQUIRED',
      status: 403,
    });
    const rows = await getDb()`select 1 from public.play_sessions where user_id = ${owner.userId}`;
    expect(rows).toHaveLength(0);
  });

  it('확인하면 시작할 수 있고, 다시 확인해도 처음 시각을 지킨다', async () => {
    const userId = await createUser({ ageConfirmed: false });
    const db = getDb();

    await confirmAge(db, userId);
    expect(await isAgeConfirmed(db, userId)).toBe(true);
    const [first] = await db<{ at: Date }[]>`select age_confirmed_at as at from public.profiles where id = ${userId}`;

    await confirmAge(db, userId);
    const [second] = await db<{ at: Date }[]>`select age_confirmed_at as at from public.profiles where id = ${userId}`;
    expect(second!.at.getTime()).toBe(first!.at.getTime());

    const started = await startSession({ mode: 'official_3' }, { kind: 'user', userId });
    expect(started.official).toBe(true);
  });

  it('프로필이 아직 없는 새 계정도 확인하면 프로필이 생긴다', async () => {
    const userId = await createAuthUser();
    expect(await isAgeConfirmed(getDb(), userId)).toBe(false);
    await confirmAge(getDb(), userId);
    expect(await isAgeConfirmed(getDb(), userId)).toBe(true);
  });

  it('requireAgeConfirmed는 확인 전이면 403', async () => {
    const userId = await createUser({ ageConfirmed: false });
    await expect(requireAgeConfirmed(getDb(), userId)).rejects.toMatchObject({
      code: 'AGE_CONFIRMATION_REQUIRED',
    });
  });

  it('비회원 체험은 나이 확인과 무관하다', async () => {
    const guest: Owner = { kind: 'guest', tokenHash: `test-${randomUUID()}` };
    await expect(startSession({ mode: 'trial' }, guest)).resolves.toMatchObject({ mode: 'trial' });
  });

  it('승계 함수 자체는 막지 않는다 — 막는 곳은 API 경계다(확인 API·승계 API)', async () => {
    // 확인 API가 확인 직후 이 함수를 부르므로 함수 안에서 막으면 순서가 꼬인다.
    const tokenHash = `test-${randomUUID()}`;
    await startSession({ mode: 'trial' }, { kind: 'guest', tokenHash });
    const userId = await createUser();
    const result = await claimGuestSessions(userId, tokenHash);
    expect(result.claimedSessions).toBe(1);
  });
});
