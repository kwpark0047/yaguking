import type { Difficulty } from '@/lib/engine';
import type { Queryable } from '../types';

/**
 * 문항 조회는 이 파일의 함수만 통과한다.
 *
 * `PublicQuestion`에는 정답(`is_correct`)과 해설(`explanation`)이 **타입 레벨에서
 * 존재하지 않는다**. 타석이 종료된 뒤에만 `loadReveal`로 따로 가져온다
 * (07 문서 §3.2, 08 문서 §4.3).
 */

export interface PublicQuestionOption {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface PublicQuestion {
  id: string;
  categorySlug: string;
  categoryTitle: string;
  difficulty: Difficulty;
  seasonScope: string | null;
  recordAsOf: string;
  stem: string;
  options: PublicQuestionOption[];
}

export interface QuestionReveal {
  explanation: string | null;
  correctOption: { id: string; label: string; text: string };
  sources: { name: string; url: string | null; verifiedAt: string }[];
}

interface QuestionRow {
  id: string;
  category_slug: string;
  category_title: string;
  difficulty: Difficulty;
  season_scope: string | null;
  record_as_of: Date | string;
  stem: string;
}

interface OptionRow {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  option_text: string;
}

const asDateString = (value: Date | string): string =>
  value instanceof Date ? (value.toISOString().split('T')[0] ?? '') : value;

/**
 * 출제 가능한 문항 하나를 고른다.
 *
 * 같은 경기에 이미 나온 문항은 제외한다. `order by random()`은 문항 수가
 * 수천 단위인 P1에서는 충분하다. 규모가 커지면 샘플링 전략을 바꾼다.
 */
export async function pickQuestionId(
  tx: Queryable,
  sessionId: string,
  difficulty: Difficulty | null,
): Promise<string | null> {
  const rows = await tx<{ id: string }[]>`
    select q.id
      from public.questions q
     where q.status = 'published'
       and (${difficulty}::public.question_difficulty is null
            or q.difficulty = ${difficulty}::public.question_difficulty)
       and not exists (
         select 1
           from public.at_bats ab
          where ab.session_id = ${sessionId}
            and ab.question_id = q.id
       )
     order by random()
     limit 1
  `;
  return rows[0]?.id ?? null;
}

/** 진행 중 화면에 내려줄 문항. 정답·해설은 포함되지 않는다. */
export async function loadPublicQuestion(
  tx: Queryable,
  questionId: string,
): Promise<PublicQuestion> {
  const [question] = await tx<QuestionRow[]>`
    select q.id,
           c.slug  as category_slug,
           c.title as category_title,
           q.difficulty,
           q.season_scope,
           q.record_as_of,
           q.stem
      from public.questions q
      join public.question_categories c on c.id = q.category_id
     where q.id = ${questionId}
  `;

  if (!question) {
    throw new Error(`question not found: ${questionId}`);
  }

  // 보기 순서는 label 고정이다. 경기 참가자 모두 같은 순서를 본다.
  const options = await tx<OptionRow[]>`
    select id, label, option_text
      from private.question_options
     where question_id = ${questionId}
     order by label
  `;

  return {
    id: question.id,
    categorySlug: question.category_slug,
    categoryTitle: question.category_title,
    difficulty: question.difficulty,
    seasonScope: question.season_scope,
    recordAsOf: asDateString(question.record_as_of),
    stem: question.stem,
    options: options.map((o) => ({ id: o.id, label: o.label, text: o.option_text })),
  };
}

/** 선택한 보기가 해당 문항 소속인지 확인하고 정오를 돌려준다. */
export async function checkOption(
  tx: Queryable,
  questionId: string,
  optionId: string,
): Promise<boolean | null> {
  const rows = await tx<{ is_correct: boolean }[]>`
    select is_correct
      from private.question_options
     where id = ${optionId}
       and question_id = ${questionId}
  `;
  return rows[0]?.is_correct ?? null;
}

/** 타석이 끝난 뒤에만 호출한다. */
export async function loadReveal(
  tx: Queryable,
  questionId: string,
): Promise<QuestionReveal> {
  const [row] = await tx<{ explanation: string | null }[]>`
    select explanation from public.questions where id = ${questionId}
  `;

  const [correct] = await tx<OptionRow[]>`
    select id, label, option_text
      from private.question_options
     where question_id = ${questionId}
       and is_correct
  `;

  const sources = await tx<
    { source_name: string; url: string | null; verified_at: Date | string }[]
  >`
    select source_name, url, verified_at
      from public.question_sources
     where question_id = ${questionId}
     order by verified_at desc
  `;

  if (!correct) {
    // 0002의 게시 가드가 막아야 하는 상태다. 여기까지 왔다면 데이터 사고다.
    throw new Error(`published question has no correct option: ${questionId}`);
  }

  return {
    explanation: row?.explanation ?? null,
    correctOption: { id: correct.id, label: correct.label, text: correct.option_text },
    sources: sources.map((s) => ({
      name: s.source_name,
      url: s.url,
      verifiedAt: asDateString(s.verified_at),
    })),
  };
}

/** 존 히트맵 집계용 밴드 */
export async function loadQuestionBands(
  tx: Queryable,
  questionIds: readonly string[],
): Promise<Map<string, { eraBand: number | null; difficultyBand: number }>> {
  if (questionIds.length === 0) return new Map();

  const rows = await tx<
    { id: string; era_band: number | null; difficulty_band: number }[]
  >`
    select id, era_band, difficulty_band
      from public.questions
     where id in ${tx(questionIds as string[])}
  `;

  return new Map(
    rows.map((r) => [r.id, { eraBand: r.era_band, difficultyBand: r.difficulty_band }]),
  );
}
