import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db/sql';
import type { Difficulty } from '@/lib/engine';

/**
 * 통합 테스트 픽스처.
 *
 * 안전 장치: DATABASE_URL이 로컬이 아니면 즉시 중단한다. 통합 테스트는
 * 테이블을 지우므로 스테이징·운영을 가리키면 사고가 난다.
 */
export function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const isLocal =
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('@db:') ||
    url.includes('host.docker.internal');

  if (!isLocal) {
    throw new Error(
      '통합 테스트는 로컬 DB에서만 실행한다. DATABASE_URL이 로컬이 아니다.',
    );
  }
}

export const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL);

export interface QuestionFixture {
  id: string;
  difficulty: Difficulty;
  correctOptionId: string;
  wrongOptionIds: string[];
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

/**
 * 게시 가능한 문항을 만든다.
 *
 * draft로 넣고 보기 4개 + 출처 1건을 채운 뒤 published로 올린다.
 * 0002의 게시 가드를 그대로 통과해야 한다.
 */
export async function createQuestion(params: {
  difficulty: Difficulty;
  eraYear?: number;
  categorySlug?: string;
}): Promise<QuestionFixture> {
  const db = getDb();
  const slug = params.categorySlug ?? 'history';

  const [category] = await db<{ id: string }[]>`
    select id from public.question_categories where slug = ${slug}
  `;
  if (!category) {
    throw new Error(`카테고리 없음: ${slug}. seed.sql을 적용했는지 확인하세요.`);
  }

  const [question] = await db<{ id: string }[]>`
    insert into public.questions (
      category_id, stem, explanation, difficulty, status, record_as_of, era_year
    )
    values (
      ${category.id},
      ${`테스트 문항 ${randomUUID()}`},
      '테스트 해설',
      ${params.difficulty}::public.question_difficulty,
      'draft',
      '2025-10-31',
      ${params.eraYear ?? 2005}
    )
    returning id
  `;
  if (!question) throw new Error('문항 생성 실패');

  const correctLabel = 'B';
  const optionIds: Record<string, string> = {};

  for (const label of LABELS) {
    const [option] = await db<{ id: string }[]>`
      insert into private.question_options (question_id, label, option_text, is_correct)
      values (
        ${question.id}, ${label}, ${`보기 ${label}`}, ${label === correctLabel}
      )
      returning id
    `;
    if (!option) throw new Error('보기 생성 실패');
    optionIds[label] = option.id;
  }

  await db`
    insert into public.question_sources (question_id, source_name, verified_at)
    values (${question.id}, '테스트 출처', '2026-09-01')
  `;

  await db`
    update public.questions
       set status = 'published'
     where id = ${question.id}
  `;

  return {
    id: question.id,
    difficulty: params.difficulty,
    correctOptionId: optionIds[correctLabel]!,
    wrongOptionIds: LABELS.filter((l) => l !== correctLabel).map((l) => optionIds[l]!),
  };
}

/** 문항 풀을 만든다. 1이닝은 길이가 가변이므로 넉넉히 둔다. */
export async function createQuestionPool(
  count: number,
  difficulty: Difficulty = 'normal',
): Promise<Map<string, QuestionFixture>> {
  const pool = new Map<string, QuestionFixture>();
  for (let i = 0; i < count; i += 1) {
    const q = await createQuestion({ difficulty, eraYear: 1990 + (i % 30) });
    pool.set(q.id, q);
  }
  return pool;
}

/** auth.users 행만 만든다. 프로필은 승계(ensureProfile)가 만들도록 둔다. */
export async function createAuthUser(): Promise<string> {
  const db = getDb();
  const userId = randomUUID();
  await db`
    insert into auth.users (id, email, aud, role)
    values (${userId}, ${`${userId}@example.test`}, 'authenticated', 'authenticated')
  `;
  return userId;
}

/** auth.users + profiles 를 함께 만든다. */
export async function createUser(params?: {
  nickname?: string;
  primaryTeamSlug?: string;
}): Promise<string> {
  const db = getDb();
  const userId = randomUUID();
  const nickname = params?.nickname ?? `테스터${userId.slice(0, 6)}`;

  await db`
    insert into auth.users (id, email, aud, role)
    values (${userId}, ${`${userId}@example.test`}, 'authenticated', 'authenticated')
  `;

  let teamId: string | null = null;
  if (params?.primaryTeamSlug) {
    const [team] = await db<{ id: string }[]>`
      select id from public.teams where slug = ${params.primaryTeamSlug}
    `;
    teamId = team?.id ?? null;
  }

  await db`
    insert into public.profiles (id, nickname, primary_team_id, onboarding_status)
    values (${userId}, ${nickname}, ${teamId}, 'completed')
  `;

  return userId;
}

/** 테스트가 만든 데이터를 지운다. 참조 순서를 지켜 삭제한다. */
export async function cleanup(): Promise<void> {
  assertLocalDatabase();
  const db = getDb();

  await db`delete from public.at_bats`;
  await db`delete from public.play_sessions`;
  await db`delete from public.xp_transactions`;
  await db`delete from public.user_batting_stats`;
  await db`delete from public.user_zone_cells`;
  await db`delete from public.user_private_stats`;
  await db`delete from public.guest_sessions`;
  await db`delete from public.question_sources`;
  await db`delete from private.question_options`;
  await db`delete from public.questions`;
  await db`delete from public.profiles`;
  await db`delete from auth.users where email like '%@example.test'`;
}

/** 마감시각을 과거로 밀어 시간초과 상황을 만든다. */
export async function expireAtBat(sessionId: string, sequence: number): Promise<void> {
  const db = getDb();
  await db`
    update public.at_bats
       set opened_at = clock_timestamp() - interval '20 seconds',
           deadline_at = clock_timestamp() - interval '5 seconds'
     where session_id = ${sessionId}
       and sequence = ${sequence}
  `;
}

/** 특정 타석을 지정한 경과시간으로 보이게 만든다. */
export async function setElapsed(
  sessionId: string,
  sequence: number,
  ms: number,
): Promise<void> {
  const db = getDb();
  await db`
    update public.at_bats
       set opened_at = clock_timestamp() - make_interval(secs => ${ms / 1000}),
           deadline_at = clock_timestamp() - make_interval(secs => ${ms / 1000})
                         + interval '15 seconds'
     where session_id = ${sessionId}
       and sequence = ${sequence}
  `;
}
