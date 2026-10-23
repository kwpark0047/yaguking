import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import type { Owner } from '@/server/play/owner';
import { getPlayState } from '@/server/play/getState';
import { startSession } from '@/server/play/startSession';
import { submitAtBat } from '@/server/play/submitAtBat';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  expireAtBat,
  hasDatabase,
  type QuestionFixture,
} from './helpers/fixtures';

/**
 * 09 문서 §7.2 — 타석 제출 멱등성·마감·순번.
 *
 * DATABASE_URL이 없으면 전체 건너뛴다. Docker 없이 로컬 Supabase 스택을
 * 띄울 수 없는 환경에서는 실행되지 않는다.
 */
describe.skipIf(!hasDatabase())('타석 제출', () => {
  let pool: Map<string, QuestionFixture>;

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    pool = await createQuestionPool(20);
  });

  afterEach(async () => {
    const db = getDb();
    await db`delete from public.at_bats`;
    await db`delete from public.play_sessions`;
    await db`delete from public.guest_sessions`;
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  const freshGuest = (): Owner => ({
    kind: 'guest',
    tokenHash: `test-${randomUUID()}`,
  });

  it('TC-IDEM-01: 동일 submissionId 2회 제출은 타석을 하나만 만든다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;
    const submissionId = randomUUID();

    const first = await submitAtBat(
      started.sessionId,
      { sequence: 1, optionId: fixture.correctOptionId, submissionId },
      owner,
    );
    const second = await submitAtBat(
      started.sessionId,
      { sequence: 1, optionId: fixture.correctOptionId, submissionId },
      owner,
    );

    expect(first.outcome).toBe('resolved');
    expect(second.outcome).toBe('replayed');
    expect(second.result).toBe(first.result);

    const db = getDb();
    const [counted] = await db<{ count: string }[]>`
      select count(*)::text as count
        from public.at_bats
       where session_id = ${started.sessionId}
         and sequence = 1
    `;
    expect(counted?.count).toBe('1');
  });

  it('TC-IDEM-02: 확정된 타석에 다른 제출 ID로 재제출하면 ALREADY_SUBMITTED', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;

    await submitAtBat(
      started.sessionId,
      {
        sequence: 1,
        optionId: fixture.correctOptionId,
        submissionId: randomUUID(),
      },
      owner,
    );

    await expect(
      submitAtBat(
        started.sessionId,
        {
          sequence: 1,
          optionId: fixture.correctOptionId,
          submissionId: randomUUID(),
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });

  it('TC-IDEM-03: 같은 submissionId로 동시에 2건을 보내도 1건만 확정된다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;
    const submissionId = randomUUID();
    const input = { sequence: 1, optionId: fixture.correctOptionId, submissionId };

    const results = await Promise.allSettled([
      submitAtBat(started.sessionId, input, owner),
      submitAtBat(started.sessionId, input, owner),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(2);

    const db = getDb();
    const [counted] = await db<{ count: string }[]>`
      select count(*)::text as count
        from public.at_bats
       where session_id = ${started.sessionId}
         and result is not null
    `;
    expect(counted?.count).toBe('1');
  });

  it('TC-DEADLINE-01: 마감 초과는 아웃으로 확정하고 outcome으로 알린다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;
    await expireAtBat(started.sessionId, 1);

    const result = await submitAtBat(
      started.sessionId,
      {
        sequence: 1,
        optionId: fixture.correctOptionId,
        submissionId: randomUUID(),
      },
      owner,
    );

    // 정답을 골랐더라도 시간초과면 아웃이다.
    expect(result.outcome).toBe('deadline_exceeded');
    expect(result.result).toBe('K');
    expect(result.isCorrect).toBe(true);
    expect(result.scoreboard.outs).toBe(1);

    // 트랜잭션이 커밋되어 아웃이 남아 있어야 한다 (예외를 던지면 롤백된다).
    const state = await getPlayState(started.sessionId, owner);
    expect(state.scoreboard.outs).toBe(1);
    expect(state.atBatsPlayed).toBe(1);
  });

  it('현재 타석과 다른 순번을 보내면 SEQUENCE_MISMATCH 또는 NOT_FOUND', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;

    await expect(
      submitAtBat(
        started.sessionId,
        {
          sequence: 5,
          optionId: fixture.correctOptionId,
          submissionId: randomUUID(),
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('다른 문항의 보기를 보내면 VALIDATION_ERROR', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const other = [...pool.values()].find((q) => q.id !== started.atBat.questionId)!;

    await expect(
      submitAtBat(
        started.sessionId,
        {
          sequence: 1,
          optionId: other.correctOptionId,
          submissionId: randomUUID(),
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('남의 경기에는 제출할 수 없다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = pool.get(started.atBat.questionId)!;

    await expect(
      submitAtBat(
        started.sessionId,
        {
          sequence: 1,
          optionId: fixture.correctOptionId,
          submissionId: randomUUID(),
        },
        freshGuest(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('3아웃이면 1이닝 체험이 종료되고 이후 제출은 거부된다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);

    let sequence = 1;
    let questionId = started.atBat.questionId;
    let finished = false;

    for (let i = 0; i < 3; i += 1) {
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
      expect(result.result).toBe('K');
      finished = result.finished;
      if (!finished) {
        sequence = result.next!.sequence;
        questionId = result.next!.questionId;
      }
    }

    expect(finished).toBe(true);

    const state = await getPlayState(started.sessionId, owner);
    expect(state.status).toBe('finished');
    expect(state.atBat).toBeNull();

    await expect(
      submitAtBat(
        started.sessionId,
        { sequence: sequence + 1, optionId: randomUUID(), submissionId: randomUUID() },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'SESSION_FINISHED' });
  });

  it('체험 경기는 공식 집계에 들어가지 않는다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    expect(started.official).toBe(false);

    let sequence = 1;
    let questionId = started.atBat.questionId;
    for (let i = 0; i < 3; i += 1) {
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
      if (result.finished) {
        expect(result.finish?.recorded).toBe(false);
        expect(result.finish?.xpEarned).toBe(0);
        break;
      }
      sequence = result.next!.sequence;
      questionId = result.next!.questionId;
    }
  });

  it('소유자가 아니면 상태 조회도 막힌다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    await expect(getPlayState(started.sessionId, freshGuest())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
