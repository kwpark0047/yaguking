-- 야구왕 P1 — 0002 문제은행
-- 정답은 public 스키마에 두지 않는다. private 스키마는 Data API에 노출되지 않으며
-- anon/authenticated 역할에 권한을 주지 않는다 (0010에서 REVOKE).

create schema if not exists private;

create type public.question_difficulty as enum ('easy', 'normal', 'hard');
create type public.question_status as enum ('draft', 'in_review', 'published', 'retired');

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.question_categories(id),
  stem text not null check (length(btrim(stem)) > 0),
  -- 해설은 타석이 종료된 뒤에만 API가 내려준다 (08 문서 §4.3).
  -- 진행 중 응답에 포함되면 정답이 노출되므로 조회 함수에서 분리한다.
  explanation text,
  difficulty public.question_difficulty not null,
  status public.question_status not null default 'draft',
  -- 정답이 바뀌지 않도록 기준을 문항에 못 박는다 (01 문서 §5).
  season_scope text,
  record_as_of date not null,
  -- 존 히트맵 가로축용 연도 (07 문서 §3.5)
  era_year smallint check (era_year between 1982 and 2100),
  -- 적응형 실력 추정용 난이도 파라미터 (P2에서 사용)
  irt_difficulty numeric(4, 2),
  era_band smallint generated always as (
    case
      when era_year is null then null
      when era_year <= 1999 then 1
      when era_year <= 2014 then 2
      else 3
    end
  ) stored,
  difficulty_band smallint generated always as (
    case
      when difficulty = 'easy'::public.question_difficulty then 1
      when difficulty = 'normal'::public.question_difficulty then 2
      else 3
    end
  ) stored,
  version integer not null default 1 check (version >= 1),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 문항 풀 선택용 (07 문서 §8)
create index idx_questions_pool
  on public.questions (status, category_id, difficulty, era_band);

-- ── 보기 (정답 포함 — 비노출 스키마) ─────────────────────────────────
create table private.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label char(1) not null check (label in ('A', 'B', 'C', 'D')),
  option_text text not null check (length(btrim(option_text)) > 0),
  is_correct boolean not null default false,
  unique (question_id, label)
);
create index idx_options_question on private.question_options (question_id);

-- ── 출처·검증 ─────────────────────────────────────────────────────────
create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  url text,
  source_name text not null,
  verified_at date not null,
  rights_note text
);
create index idx_sources_question on public.question_sources (question_id);

-- 감사 추적: 승인·정정 이력
create table public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reviewer_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  reporter_id uuid,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

-- ── 게시 조건 검증 ────────────────────────────────────────────────────
-- 보기 정확히 4개, 정답 정확히 1개, 출처 1건 이상이어야 published로 전이 가능.
-- 자동 생성 문항이 무검수로 게시되는 경로를 DB 레벨에서 차단한다 (06 문서 D4).
create or replace function private.assert_question_publishable(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_options integer;
  v_correct integer;
  v_sources integer;
begin
  select count(*), count(*) filter (where is_correct)
    into v_options, v_correct
    from private.question_options
   where question_id = p_question_id;

  select count(*) into v_sources
    from public.question_sources
   where question_id = p_question_id;

  if v_options <> 4 then
    raise exception 'QUESTION_OPTIONS_INVALID: 보기는 정확히 4개여야 합니다 (현재 %)', v_options;
  end if;

  if v_correct <> 1 then
    raise exception 'QUESTION_ANSWER_INVALID: 정답은 정확히 1개여야 합니다 (현재 %)', v_correct;
  end if;

  if v_sources < 1 then
    raise exception 'QUESTION_SOURCE_REQUIRED: 검증된 출처가 최소 1건 필요합니다';
  end if;
end;
$$;

create or replace function private.questions_publish_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- SQL은 OR의 단축 평가를 보장하지 않으므로 OLD 접근을 분기로 분리한다.
  -- (INSERT 트리거에서 old.status를 읽으면 오류가 난다)
  if new.status = 'published'::public.question_status then
    if tg_op = 'INSERT' then
      perform private.assert_question_publishable(new.id);
    elsif old.status is distinct from new.status then
      perform private.assert_question_publishable(new.id);
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger questions_publish_guard
  before insert or update on public.questions
  for each row execute function private.questions_publish_guard();
