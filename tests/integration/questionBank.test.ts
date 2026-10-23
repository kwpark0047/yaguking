import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { createQuestion } from '@/server/admin/questions';
import {
  assertLocalDatabase,
  cleanup,
  createAuthUser,
  hasDatabase,
} from './helpers/fixtures';

/**
 * 문제은행 무결성 (0013).
 *
 * 한 경기에서 같은 문항이 두 번 나오지 않게 하는 제약은
 * unique(session_id, question_id)이지만, **내용이 같은 다른 문항**은 그걸로
 * 막지 못한다. 임포터를 두 번 돌리면 한 이닝에 같은 질문이 두 번 나왔다.
 */
describe.skipIf(!hasDatabase())('문제은행 중복 방지', () => {
  let actorId: string;

  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    actorId = await createAuthUser();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  function draft(stem: string) {
    return {
      categorySlug: 'rules',
      stem,
      difficulty: 'normal' as const,
      recordAsOf: '2026-10-23',
      options: [
        { label: 'A' as const, text: '보기 A', isCorrect: false },
        { label: 'B' as const, text: '보기 B', isCorrect: true },
        { label: 'C' as const, text: '보기 C', isCorrect: false },
        { label: 'D' as const, text: '보기 D', isCorrect: false },
      ],
      source: { name: '테스트 출처', verifiedAt: '2026-10-23' },
    };
  }

  it('같은 본문의 활성 문항을 두 번 만들 수 없다', async () => {
    const stem = `테스트 문항 중복확인 ${randomUUID()}`;

    const first = await createQuestion(draft(stem), actorId);
    expect(first.id).toBeTruthy();

    await expect(createQuestion(draft(stem), actorId)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('DB 제약이 최종 방어선이다 (애플리케이션 체크를 우회해도 막힌다)', async () => {
    const db = getDb();
    const stem = `테스트 문항 제약확인 ${randomUUID()}`;

    const [category] = await db<{ id: string }[]>`
      select id from public.question_categories where slug = 'rules'
    `;

    await db`
      insert into public.questions (category_id, stem, difficulty, status, record_as_of)
      values (${category!.id}, ${stem}, 'normal', 'draft', '2026-10-23')
    `;

    // 애플리케이션 체크를 거치지 않는 직접 INSERT 도 막혀야 한다.
    await expect(
      db`
        insert into public.questions (category_id, stem, difficulty, status, record_as_of)
        values (${category!.id}, ${stem}, 'normal', 'draft', '2026-10-23')
      `,
    ).rejects.toThrow();
  });

  it('내린(retired) 문항과 같은 본문은 다시 올릴 수 있다', async () => {
    const db = getDb();
    const stem = `테스트 문항 재사용 ${randomUUID()}`;

    const [category] = await db<{ id: string }[]>`
      select id from public.question_categories where slug = 'rules'
    `;

    const [old] = await db<{ id: string }[]>`
      insert into public.questions (category_id, stem, difficulty, status, record_as_of)
      values (${category!.id}, ${stem}, 'normal', 'draft', '2026-10-23')
      returning id
    `;

    await db`update public.questions set status = 'retired' where id = ${old!.id}`;

    // 정정으로 내린 문항과 같은 본문을 새로 올리는 건 허용되어야 한다.
    const [fresh] = await db<{ id: string }[]>`
      insert into public.questions (category_id, stem, difficulty, status, record_as_of)
      values (${category!.id}, ${stem}, 'normal', 'draft', '2026-10-23')
      returning id
    `;
    expect(fresh?.id).toBeTruthy();
    expect(fresh?.id).not.toBe(old?.id);
  });
});
