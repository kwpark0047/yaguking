import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
} from './helpers/fixtures';

/** 09 문서 §7.2 — 비회원 체험 상한과 회원 전용 모드. */
describe.skipIf(!hasDatabase())('게스트 체험 상한', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(30);
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  const freshGuest = (): Owner => ({
    kind: 'guest',
    tokenHash: `test-${randomUUID()}`,
  });

  it('TC-GUEST-01: 하루 2이닝까지만 체험할 수 있다', async () => {
    const owner = freshGuest();

    const first = await startSession({ mode: 'trial' }, owner);
    expect(first.guestTrialRemaining).toBe(1);

    const second = await startSession({ mode: 'trial' }, owner);
    expect(second.guestTrialRemaining).toBe(0);

    await expect(startSession({ mode: 'trial' }, owner)).rejects.toMatchObject({
      code: 'GUEST_TRIAL_EXHAUSTED',
    });
  });

  it('TC-GUEST-02: KST 날짜가 바뀌면 카운터가 리셋된다', async () => {
    const owner = freshGuest();
    const db = getDb();

    await startSession({ mode: 'trial' }, owner);
    await startSession({ mode: 'trial' }, owner);

    // 어제 기록으로 밀어 날짜 경과를 만든다.
    await db`
      update public.guest_sessions
         set day_key = public.kst_today() - 1
       where token_hash = ${owner.kind === 'guest' ? owner.tokenHash : ''}
    `;

    const afterRollover = await startSession({ mode: 'trial' }, owner);
    expect(afterRollover.guestTrialRemaining).toBe(1);
  });

  it('상한 초과 시에도 체험 횟수가 3으로 올라가지 않는다 (CHECK 위반 없음)', async () => {
    const owner = freshGuest();
    await startSession({ mode: 'trial' }, owner);
    await startSession({ mode: 'trial' }, owner);
    await expect(startSession({ mode: 'trial' }, owner)).rejects.toMatchObject({
      code: 'GUEST_TRIAL_EXHAUSTED',
    });

    const db = getDb();
    const [row] = await db<{ innings_started: number }[]>`
      select innings_started
        from public.guest_sessions
       where token_hash = ${owner.kind === 'guest' ? owner.tokenHash : ''}
    `;
    expect(row?.innings_started).toBe(2);
  });

  it('비회원은 공식 모드를 시작할 수 없다', async () => {
    await expect(
      startSession({ mode: 'official_3' }, freshGuest()),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_REQUIRED' });

    await expect(startSession({ mode: 'daily' }, freshGuest())).rejects.toMatchObject({
      code: 'MEMBERSHIP_REQUIRED',
    });
  });

  it('프로필이 없는 회원은 경기를 시작할 수 없다 — 만 14세 확인 전과 같다', async () => {
    // 프로필은 만 14세 확인 때 만들어진다(0017). 프로필이 없으면 확인 전이다.
    await expect(
      startSession({ mode: 'official_3' }, { kind: 'user', userId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'AGE_CONFIRMATION_REQUIRED' });
  });

  it('회원 공식 경기는 official=true로 시작한다', async () => {
    const userId = await createUser({ primaryTeamSlug: 'doosan' });
    const started = await startSession(
      { mode: 'official_3' },
      { kind: 'user', userId },
    );
    expect(started.official).toBe(true);
    expect(started.goal).toEqual({ kind: 'innings', target: 3 });
    expect(started.guestTrialRemaining).toBeNull();
  });
});
