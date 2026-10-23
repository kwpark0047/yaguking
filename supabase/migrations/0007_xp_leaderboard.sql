-- 야구왕 P1 — 0007 XP 원장과 리더보드
-- 지급은 원장 INSERT와 합계 갱신을 같은 트랜잭션에서 수행한다.
-- idempotency_key로 중복 지급을 차단한다 (03 문서 §5 승계).

create table public.user_private_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level smallint not null default 1 check (level between 1 and 7),
  total_games integer not null default 0 check (total_games >= 0),
  total_correct integer not null default 0 check (total_correct >= 0),
  total_wrong integer not null default 0 check (total_wrong >= 0),
  updated_at timestamptz not null default now()
);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  -- 결정적 식별자: eventType:entityId:userId
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_xp_user_created
  on public.xp_transactions (user_id, created_at desc);

-- 레벨 임계값은 V1과 동일하게 유지한다. 표기만 야구 등급명으로 바꾼다
-- (육성선수/백업/주전/올스타/골든글러브/MVP/명예의 전당) — 06 문서 §9.
create or replace function public.level_for_xp(p_xp bigint)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_xp >= 20000 then 7
    when p_xp >= 12000 then 6
    when p_xp >= 7000 then 5
    when p_xp >= 3500 then 4
    when p_xp >= 1500 then 3
    when p_xp >= 500 then 2
    else 1
  end::smallint;
$$;

create table public.leaderboard_entries (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null default 0,
  wins integer not null default 0,
  games integer not null default 0,
  rating integer,
  rank integer,
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index idx_leaderboard_rank on public.leaderboard_entries (season_id, rank);

-- ── 오답노트 (복습 간격 1·3·7·14일, V1 승계) ─────────────────────────
create table public.wrong_answer_reviews (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  stage smallint not null default 0 check (stage between 0 and 4),
  due_at timestamptz not null,
  last_result boolean,
  consecutive_correct smallint not null default 0 check (consecutive_correct >= 0),
  mastered_at timestamptz,
  primary key (user_id, question_id)
);
create index idx_reviews_due on public.wrong_answer_reviews (user_id, due_at);

create table public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  correct boolean not null,
  reviewed_at timestamptz not null default now()
);
