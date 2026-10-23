import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/sql';
import type { Queryable } from '@/lib/db/types';
import type { Difficulty } from '@/lib/engine';
import type { AdminQuestionDto } from '@/types/api';

/**
 * 운영 콘솔 최소본 (08 문서 V19).
 *
 * 관리자 권한은 **DB로 확인한다.** JWT의 user_metadata는 사용자가 바꿀 수
 * 있으므로 권한 판정에 쓰지 않는다 (01 문서 §7).
 */
export async function assertAdmin(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db<{ role: string }[]>`
    select role from public.admin_users where user_id = ${userId}
  `;
  if (!row) throw new ApiError('FORBIDDEN', '운영 권한이 없습니다.');
}

export async function listQuestions(
  status: string | null,
  limit = 50,
): Promise<AdminQuestionDto[]> {
  const db = getDb();

  const rows = await db<
    {
      id: string;
      stem: string;
      category_slug: string;
      difficulty: Difficulty;
      status: string;
      record_as_of: Date;
      option_count: string;
      correct_count: string;
      source_count: string;
    }[]
  >`
    select q.id, q.stem, c.slug as category_slug, q.difficulty, q.status,
           q.record_as_of,
           (select count(*) from private.question_options o
             where o.question_id = q.id)::text as option_count,
           (select count(*) from private.question_options o
             where o.question_id = q.id and o.is_correct)::text as correct_count,
           (select count(*) from public.question_sources s
             where s.question_id = q.id)::text as source_count
      from public.questions q
      join public.question_categories c on c.id = q.category_id
     where (${status}::text is null or q.status = ${status}::public.question_status)
     order by q.created_at desc
     limit ${limit}
  `;

  return rows.map((row) => {
    const optionCount = Number(row.option_count);
    const correctCount = Number(row.correct_count);
    const sourceCount = Number(row.source_count);

    return {
      id: row.id,
      stem: row.stem,
      categorySlug: row.category_slug,
      difficulty: row.difficulty,
      status: row.status,
      recordAsOf: row.record_as_of.toISOString().split('T')[0] ?? '',
      optionCount,
      correctCount,
      sourceCount,
      // 0002의 게시 가드와 같은 조건. 화면에서 미리 알려 주기 위한 것이며
      // 실제 차단은 DB가 한다.
      publishable: optionCount === 4 && correctCount === 1 && sourceCount >= 1,
    };
  });
}

export interface CreateQuestionInput {
  categorySlug: string;
  stem: string;
  explanation?: string;
  difficulty: Difficulty;
  recordAsOf: string;
  eraYear?: number;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string; isCorrect: boolean }[];
  source: { name: string; url?: string; verifiedAt: string };
}

/**
 * 문항 등록. 항상 `draft`로 들어간다.
 * 자동 생성이든 수기 작성이든 **승인 없이는 게시될 수 없다** (06 문서 D4).
 */
export async function createQuestion(
  input: CreateQuestionInput,
  actorId: string,
): Promise<{ id: string }> {
  const db = getDb();

  if (input.options.length !== 4) {
    throw new ApiError('VALIDATION_ERROR', '보기는 정확히 4개여야 합니다.');
  }
  if (input.options.filter((option) => option.isCorrect).length !== 1) {
    throw new ApiError('VALIDATION_ERROR', '정답은 정확히 1개여야 합니다.');
  }

  return db.begin(async (tx) => {
    const [category] = await tx<{ id: string }[]>`
      select id from public.question_categories where slug = ${input.categorySlug}
    `;
    if (!category) throw new ApiError('VALIDATION_ERROR', '카테고리를 찾을 수 없습니다.');

    // 같은 본문이 이미 출제 대상으로 있으면 막는다 (0013 유니크 인덱스).
    // 사람이 읽을 수 있는 메시지로 바꿔 준다.
    const [duplicate] = await tx<{ id: string }[]>`
      select id from public.questions
       where stem = ${input.stem}
         and status <> 'retired'
    `;
    if (duplicate) {
      throw new ApiError('VALIDATION_ERROR', '같은 본문의 문항이 이미 있습니다.');
    }

    const [question] = await tx<{ id: string }[]>`
      insert into public.questions (
        category_id, stem, explanation, difficulty, status, record_as_of, era_year, created_by
      )
      values (
        ${category.id}, ${input.stem}, ${input.explanation ?? null},
        ${input.difficulty}::public.question_difficulty, 'draft',
        ${input.recordAsOf}::date, ${input.eraYear ?? null}, ${actorId}
      )
      returning id
    `;
    if (!question) throw new ApiError('INTERNAL_ERROR');

    for (const option of input.options) {
      await tx`
        insert into private.question_options (question_id, label, option_text, is_correct)
        values (${question.id}, ${option.label}, ${option.text}, ${option.isCorrect})
      `;
    }

    await tx`
      insert into public.question_sources (question_id, source_name, url, verified_at)
      values (
        ${question.id}, ${input.source.name}, ${input.source.url ?? null},
        ${input.source.verifiedAt}::date
      )
    `;

    await writeAudit(tx, actorId, 'question.create', question.id);
    return { id: question.id };
  });
}

/**
 * 게시 승인.
 *
 * 보기 4개·정답 1개·출처 1건 검증은 **DB 트리거가 최종 판단**한다. 여기서는
 * 그 오류를 사람이 읽을 수 있는 메시지로 바꿔 준다.
 */
export async function publishQuestion(
  questionId: string,
  actorId: string,
): Promise<void> {
  const db = getDb();

  await db.begin(async (tx) => {
    const [question] = await tx<{ id: string; status: string; version: number }[]>`
      select id, status, version from public.questions
       where id = ${questionId} for update
    `;
    if (!question) throw new ApiError('NOT_FOUND', '문항을 찾을 수 없습니다.');

    try {
      await tx`
        update public.questions
           set status = 'published', version = version + 1
         where id = ${questionId}
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('QUESTION_OPTIONS_INVALID')) {
        throw new ApiError('VALIDATION_ERROR', '보기는 정확히 4개여야 합니다.');
      }
      if (message.includes('QUESTION_ANSWER_INVALID')) {
        throw new ApiError('VALIDATION_ERROR', '정답은 정확히 1개여야 합니다.');
      }
      if (message.includes('QUESTION_SOURCE_REQUIRED')) {
        throw new ApiError('VALIDATION_ERROR', '검증된 출처가 최소 1건 필요합니다.');
      }
      throw error;
    }

    // 감사 추적: 승인 시점의 스냅샷을 남긴다 (02 문서 question_versions).
    await tx`
      insert into public.question_versions (question_id, version, snapshot, reviewer_id, reason)
      values (
        ${questionId},
        ${question.version + 1},
        (select to_jsonb(q) from public.questions q where q.id = ${questionId}),
        ${actorId},
        'publish'
      )
      on conflict (question_id, version) do nothing
    `;

    await writeAudit(tx, actorId, 'question.publish', questionId);
  });
}

export async function retireQuestion(
  questionId: string,
  actorId: string,
): Promise<void> {
  const db = getDb();
  await db.begin(async (tx) => {
    await tx`
      update public.questions set status = 'retired' where id = ${questionId}
    `;
    await writeAudit(tx, actorId, 'question.retire', questionId);
  });
}

async function writeAudit(
  tx: Queryable,
  actorId: string,
  action: string,
  entityId: string,
): Promise<void> {
  await tx`
    insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (${actorId}, ${action}, 'question', ${entityId})
  `;
}
