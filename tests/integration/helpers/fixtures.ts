import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
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

/**
 * **출제된 문항의 보기를 그때그때 조회한다.**
 *
 * 미리 만든 맵에 의존하면, 시드 문항처럼 테스트가 만들지 않은 문항이 출제될 때
 * 조회가 빗나간다. 실제로 그렇게 깨졌다. 어떤 문항이 나오든 동작해야 한다.
 */
export async function optionsFor(questionId: string): Promise<QuestionFixture> {
  const db = getDb();
  const rows = await db<{ id: string; is_correct: boolean }[]>`
    select id, is_correct
      from private.question_options
     where question_id = ${questionId}
     order by label
  `;

  const correct = rows.find((row) => row.is_correct);
  if (!correct) throw new Error(`정답이 없는 문항: ${questionId}`);

  const [difficulty] = await db<{ difficulty: Difficulty }[]>`
    select difficulty from public.questions where id = ${questionId}
  `;

  return {
    id: questionId,
    difficulty: difficulty?.difficulty ?? 'normal',
    correctOptionId: correct.id,
    wrongOptionIds: rows.filter((row) => !row.is_correct).map((row) => row.id),
  };
}

/** 지정한 문항이 아닌 다른 게시 문항의 정답 보기 id. 보기 소속 검증 테스트용. */
export async function optionFromAnotherQuestion(
  excludeQuestionId: string,
): Promise<string> {
  const db = getDb();
  const [row] = await db<{ id: string }[]>`
    select o.id
      from private.question_options o
      join public.questions q on q.id = o.question_id
     where q.status = 'published'
       and q.id <> ${excludeQuestionId}
       and o.is_correct
     limit 1
  `;
  if (!row) throw new Error('다른 문항을 찾지 못했습니다.');
  return row.id;
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

/**
 * 인증 사용자 하나를 만든다. 프로필은 승계(ensureProfile)가 만들도록 둔다.
 *
 * service_role 키가 있으면 **Auth 관리 API로 만든다.** `auth.users` 에 직접
 * INSERT 하면 GoTrue 가 인식하지 못해(`User not found`) 삭제 경로를 검증할 수
 * 없다. 키가 없는 환경에서는 직접 INSERT 로 떨어져 나머지 테스트는 돌아간다.
 */
export async function createAuthUser(): Promise<string> {
  const email = `${randomUUID()}@example.test`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`테스트 사용자 생성 실패: ${error?.message ?? 'unknown'}`);
    }
    return data.user.id;
  }

  const db = getDb();
  const userId = randomUUID();
  await db`
    insert into auth.users (id, email, aud, role)
    values (${userId}, ${email}, 'authenticated', 'authenticated')
  `;
  return userId;
}

/** auth.users + profiles 를 함께 만든다. */
export async function createUser(params?: {
  nickname?: string;
  primaryTeamSlug?: string;
}): Promise<string> {
  const db = getDb();
  const userId = await createAuthUser();
  const nickname = params?.nickname ?? `테스터${userId.slice(0, 6)}`;

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

/** 테스트가 만든 문항임을 알아보는 표식. */
const TEST_STEM_PREFIX = '테스트 문항 ';
/** 테스트가 만든 게스트 토큰 접두사 (atBatSubmit, claimGuest 등에서 사용) */
const TEST_TOKEN_PREFIXES = ['test-', 'claim-'];

/**
 * 테스트가 만든 데이터만 지운다.
 *
 * 테이블을 통째로 비우면 `supabase/seed.sql`과 시드 문항까지 날아가서, 이후
 * E2E나 수동 플레이가 "출제할 문항이 없음" 상태로 깨진다. 실제로 그렇게
 * 깨졌던 적이 있어 범위를 좁혔다.
 *
 * 구단·카테고리·시즌 같은 기준 데이터는 건드리지 않는다.
 */
export async function cleanup(): Promise<void> {
  assertLocalDatabase();
  const db = getDb();

  await deleteTestPlayData(db);

  // 테스트 문항은 게시 상태로 만들어지므로, 테스트가 도는 동안 같은 DB를 쓰는
  // 개발 서버나 E2E의 경기가 그 문항을 뽑아 갈 수 있다. 그 타석은 테스트
  // 세션 소속이 아니라 위에서 지워지지 않고, 남아 있으면 외래키 때문에 아래
  // 문항 삭제가 막혀 **이후 모든 파일의 정리가 연쇄로 실패한다.** 실제로
  // E2E와 통합 테스트를 동시에 돌렸다가 8개 파일이 그렇게 깨졌다.
  // 테스트 문항은 정의상 버리는 데이터이므로, 누가 뽑았든 그 타석까지 지운다.
  await db`
    delete from public.at_bats
     where question_id in (
       select id from public.questions where stem like ${TEST_STEM_PREFIX + '%'}
     )
  `;

  // 문항은 테스트가 만든 것만. 옵션·출처는 CASCADE.
  await db`delete from public.questions where stem like ${TEST_STEM_PREFIX + '%'}`;
}

/** 테스트가 만든 경기·게스트·회원을 지운다. at_bats·집계는 CASCADE. */
async function deleteTestPlayData(db: ReturnType<typeof getDb>): Promise<void> {
  await db`
    delete from public.play_sessions
     where guest_session_id in (
             select id from public.guest_sessions
              where token_hash like ${TEST_TOKEN_PREFIXES[0] + '%'}
                 or token_hash like ${TEST_TOKEN_PREFIXES[1] + '%'}
           )
        or user_id in (select id from auth.users where email like '%@example.test')
  `;

  await db`
    delete from public.guest_sessions
     where token_hash like ${TEST_TOKEN_PREFIXES[0] + '%'}
        or token_hash like ${TEST_TOKEN_PREFIXES[1] + '%'}
  `;

  // 프로필 삭제가 xp·성적·존 집계를 CASCADE 로 함께 지운다.
  await db`
    delete from public.profiles
     where id in (select id from auth.users where email like '%@example.test')
  `;
  await db`delete from auth.users where email like '%@example.test'`;
}

/**
 * 테스트 사이에 경기·집계만 비운다. 문항과 기준 데이터는 남긴다.
 * 테스트가 도는 동안 브라우저에서 수동 플레이 중이어도 그 세션을 죽이지 않는다.
 */
export async function resetPlayData(): Promise<void> {
  assertLocalDatabase();
  await deleteTestPlayData(getDb());
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
