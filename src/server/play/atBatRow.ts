import { ApiError } from '@/lib/api/errors';
import { loadPublicQuestion, pickQuestionId } from '@/lib/db/queries/questions';
import type { PublicQuestion } from '@/lib/db/queries/questions';
import type { Queryable } from '@/lib/db/types';
import { LIMIT_MS } from '@/lib/engine';
import type { AtBatDto } from '@/types/api';
import { plannedDifficulty, type AtBatRow, type PlaySessionRow } from './sessionRow';

const AT_BAT_COLUMNS = `
  id, session_id, sequence, question_id, inning, outs_before, bases_before,
  opened_at, deadline_at, option_id, submission_id, elapsed_ms, is_correct,
  result, upgraded, upgrade_reason, rbi, bases_after
`;

export interface OpenAtBat {
  row: AtBatRow;
  question: PublicQuestion;
}

/**
 * 다음 타석을 연다.
 *
 * opened_at / deadline_at는 **DB 시계**로 기록한다. 경과시간 판정의 기준이
 * 서버 한 곳이어야 하므로 애플리케이션 시계를 쓰지 않는다 (03 문서 §3).
 */
export async function openAtBat(
  tx: Queryable,
  session: PlaySessionRow,
  params: { sequence: number; inning: number; outs: number; bases: number },
): Promise<OpenAtBat> {
  const difficulty = plannedDifficulty(session.mode, params.sequence);

  // 계획한 난이도에 남은 문항이 없으면 난이도 제한을 풀고 다시 고른다.
  const questionId =
    (await pickQuestionId(tx, session.id, difficulty)) ??
    (await pickQuestionId(tx, session.id, null));

  if (!questionId) {
    throw new ApiError(
      'INTERNAL_ERROR',
      '출제할 문항이 부족합니다. 문제은행을 확인해 주세요.',
    );
  }

  const [row] = await tx<AtBatRow[]>`
    insert into public.at_bats (
      session_id, sequence, question_id, inning, outs_before, bases_before,
      opened_at, deadline_at
    )
    values (
      ${session.id}, ${params.sequence}, ${questionId}, ${params.inning},
      ${params.outs}, ${params.bases},
      clock_timestamp(),
      clock_timestamp() + make_interval(secs => ${LIMIT_MS / 1000})
    )
    returning ${tx.unsafe(AT_BAT_COLUMNS)}
  `;
  if (!row) throw new ApiError('INTERNAL_ERROR');

  const question = await loadPublicQuestion(tx, questionId);
  return { row, question };
}

/** 미제출(진행 중) 타석. 없으면 null. */
export async function findPendingAtBat(
  tx: Queryable,
  sessionId: string,
  forUpdate = false,
): Promise<AtBatRow | null> {
  const rows = forUpdate
    ? await tx<AtBatRow[]>`
        select ${tx.unsafe(AT_BAT_COLUMNS)}
          from public.at_bats
         where session_id = ${sessionId}
           and result is null
         order by sequence
         limit 1
         for update
      `
    : await tx<AtBatRow[]>`
        select ${tx.unsafe(AT_BAT_COLUMNS)}
          from public.at_bats
         where session_id = ${sessionId}
           and result is null
         order by sequence
         limit 1
      `;
  return rows[0] ?? null;
}

export async function findAtBatBySubmission(
  tx: Queryable,
  submissionId: string,
): Promise<AtBatRow | null> {
  const [row] = await tx<AtBatRow[]>`
    select ${tx.unsafe(AT_BAT_COLUMNS)}
      from public.at_bats
     where submission_id = ${submissionId}
  `;
  return row ?? null;
}

export async function findAtBatBySequence(
  tx: Queryable,
  sessionId: string,
  sequence: number,
): Promise<AtBatRow | null> {
  const [row] = await tx<AtBatRow[]>`
    select ${tx.unsafe(AT_BAT_COLUMNS)}
      from public.at_bats
     where session_id = ${sessionId}
       and sequence = ${sequence}
     for update
  `;
  return row ?? null;
}

/** 공개용 타석 정보. 정답·해설은 담지 않는다 (AtBatDto가 타입으로 강제한다). */
export function toPublicAtBat(
  row: AtBatRow,
  question: PublicQuestion,
  now: Date,
): AtBatDto {
  return {
    sequence: row.sequence,
    questionId: question.id,
    category: question.categoryTitle,
    difficulty: question.difficulty,
    seasonScope: question.seasonScope,
    recordAsOf: question.recordAsOf,
    stem: question.stem,
    options: question.options,
    openedAt: row.opened_at.toISOString(),
    deadlineAt: row.deadline_at.toISOString(),
    remainingMs: Math.max(0, row.deadline_at.getTime() - now.getTime()),
  };
}
