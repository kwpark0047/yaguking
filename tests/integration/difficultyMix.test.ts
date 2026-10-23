import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db/sql';
import type { Owner } from '@/server/play/owner';
import { startSession } from '@/server/play/startSession';
import { submitAtBat } from '@/server/play/submitAtBat';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  hasDatabase,
  optionsFor,
} from './helpers/fixtures';

/**
 * 출제 난이도 분포 (10 문서 §1.2.2).
 *
 * 문제은행을 **고급 쪽으로 심하게 기울여 놓고** 체험 1이닝을 돌린다.
 * 출제 분포가 문제은행 구성을 따라가면 안 된다 — 고급은 판정 엔진의 승급
 * 조건이라, 고급 문항을 채울 때마다 안타·홈런이 부풀기 때문이다.
 *
 * 단위 테스트(plannedDifficulty.test.ts)는 계획 함수만 본다. 이 테스트는
 * 실제 출제 경로(openAtBat → pickQuestionId)까지 포함해 확인한다.
 */

/** 문제은행 구성: 고급 60%. 실제 운영 풀(39%)보다 더 기울였다. */
const POOL = { easy: 40, normal: 40, hard: 120 };
const POOL_HARD_SHARE = POOL.hard / (POOL.easy + POOL.normal + POOL.hard);

/** 3타석부터 세므로 1~2타석은 버린다. 초급 소진(40개)보다 충분히 적게 뽑는다. */
const DRAWS = 60;

describe.skipIf(!hasDatabase())('출제 난이도 분포', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(POOL.easy, 'easy');
    await createQuestionPool(POOL.normal, 'normal');
    await createQuestionPool(POOL.hard, 'hard');
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('문제은행이 고급으로 기울어도 출제는 설계값 20%를 따른다', async () => {
    const owner: Owner = { kind: 'guest', tokenHash: `test-${randomUUID()}` };
    const started = await startSession({ mode: 'trial' }, owner);

    const served: string[] = [];
    let atBat = started.atBat;

    // 정답만 고르면 아웃이 없어 이닝이 끝나지 않는다.
    for (let i = 0; i < DRAWS + 2; i += 1) {
      if (atBat.sequence >= 3) served.push(atBat.difficulty);

      const fixture = await optionsFor(atBat.questionId);
      const result = await submitAtBat(
        started.sessionId,
        {
          sequence: atBat.sequence,
          optionId: fixture.correctOptionId,
          submissionId: randomUUID(),
        },
        owner,
      );

      expect(result.outcome).toBe('resolved');
      if (result.finished || !result.next) break;
      atBat = result.next;
    }

    expect(served.length).toBe(DRAWS);

    const hard = served.filter((d) => d === 'hard').length / served.length;
    const easy = served.filter((d) => d === 'easy').length / served.length;

    // 문제은행을 따라갔다면 60% 근처여야 한다. 그 절반에도 못 미쳐야 한다.
    expect(hard).toBeLessThan(POOL_HARD_SHARE / 2);
    // 설계값 20% 근처(표본 60개의 흔들림을 감안한 폭).
    expect(hard).toBeGreaterThan(0.05);
    expect(hard).toBeLessThan(0.4);
    // 초급이 사라지지 않았는지도 본다 — 필터가 걸린다는 증거다.
    expect(easy).toBeGreaterThan(0.2);
  }, 120_000);

  it('체험의 첫 두 타석은 초급·중급으로 고정된다', async () => {
    const owner: Owner = { kind: 'guest', tokenHash: `test-${randomUUID()}` };
    const started = await startSession({ mode: 'trial' }, owner);
    expect(started.atBat.difficulty).toBe('easy');

    const fixture = await optionsFor(started.atBat.questionId);
    const result = await submitAtBat(
      started.sessionId,
      {
        sequence: started.atBat.sequence,
        optionId: fixture.correctOptionId,
        submissionId: randomUUID(),
      },
      owner,
    );

    expect(result.next?.difficulty).toBe('normal');
  }, 60_000);
});
