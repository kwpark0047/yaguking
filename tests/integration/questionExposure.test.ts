import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db/sql';
import type { Owner } from '@/server/play/owner';
import { getPlayState } from '@/server/play/getState';
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
 * 09 문서 §7.2 TC-SEC-01 — 정답 비노출.
 *
 * 직렬화된 페이로드에 금지 키가 **없어야** 한다. 타입으로 막아도 런타임에서
 * 다시 확인한다. 이 테스트가 깨지면 문제은행이 새는 것이다.
 */
const FORBIDDEN_KEYS = ['is_correct', 'isCorrect', 'explanation', 'correctOption'];

function findForbidden(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];

  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findForbidden(item, `${path}[${i}]`)));
    return hits;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push(`${path}.${key}`);
    hits.push(...findForbidden(child, `${path}.${key}`));
  }
  return hits;
}

describe.skipIf(!hasDatabase())('정답 노출 차단', () => {

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(20);
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  const freshGuest = (): Owner => ({
    kind: 'guest',
    tokenHash: `test-${randomUUID()}`,
  });

  it('경기 시작 응답에 정답·해설이 없다', async () => {
    const started = await startSession({ mode: 'trial' }, freshGuest());
    expect(findForbidden(started)).toEqual([]);
    expect(JSON.stringify(started)).not.toContain('is_correct');
  });

  it('상태 복원 응답에 정답·해설이 없다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const state = await getPlayState(started.sessionId, owner);
    expect(findForbidden(state)).toEqual([]);
  });

  it('진행 중 타석의 보기에는 정오 표시가 없다', async () => {
    const started = await startSession({ mode: 'trial' }, freshGuest());
    for (const option of started.atBat.options) {
      expect(Object.keys(option).sort()).toEqual(['id', 'label', 'text']);
    }
  });

  it('다음 타석 정보에도 정답이 없다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = await optionsFor(started.atBat.questionId);

    const result = await submitAtBat(
      started.sessionId,
      {
        sequence: 1,
        optionId: fixture.correctOptionId,
        submissionId: randomUUID(),
      },
      owner,
    );

    expect(result.next).not.toBeNull();
    expect(findForbidden(result.next)).toEqual([]);
  });

  it('타석이 끝난 뒤에는 해설과 정답이 내려온다', async () => {
    const owner = freshGuest();
    const started = await startSession({ mode: 'trial' }, owner);
    const fixture = await optionsFor(started.atBat.questionId);

    const result = await submitAtBat(
      started.sessionId,
      {
        sequence: 1,
        optionId: fixture.correctOptionId,
        submissionId: randomUUID(),
      },
      owner,
    );

    // 종료된 타석에 대해서만 공개한다.
    expect(result.reveal).not.toBeNull();
    expect(result.reveal?.correctOption.id).toBe(fixture.correctOptionId);
    expect(result.reveal?.explanation?.length ?? 0).toBeGreaterThan(0);
    expect(result.reveal?.sources.length).toBeGreaterThan(0);
  });
});
