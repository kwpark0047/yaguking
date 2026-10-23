-- 야구왕 P1 — 0001 참조 데이터
-- 적용 순서: 참조 → 문제 → 회원 → 게임 → 시즌·성적 → XP → 존 → RLS → 권한
-- gen_random_uuid()는 PostgreSQL 13+ 코어 함수다 (확장 설치 불필요).

-- ── 구단 ──────────────────────────────────────────────────────────────
-- 구단은 텍스트 명칭으로만 다룬다. 로고·엠블럼·유니폼·공식 컬러는
-- 권리 검토 완료 전까지 저장하지 않는다 (08 문서 머리말).
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  canonical_name text not null,
  short_name text not null,
  -- 연혁은 출처와 함께 검수 단계에서 입력한다. 미검증 값을 넣지 않는다.
  active_from smallint check (active_from between 1982 and 2100),
  active_to smallint check (active_to between 1982 and 2100),
  created_at timestamptz not null default now(),
  constraint teams_active_range check (active_to is null or active_from is null or active_to >= active_from)
);

-- 구단 개명 이력 (예: 전신 구단 → 현 구단)
create table public.team_name_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  from_year smallint not null check (from_year between 1982 and 2100),
  to_year smallint check (to_year between 1982 and 2100),
  constraint team_name_range check (to_year is null or to_year >= from_year)
);

-- ── 선수 ──────────────────────────────────────────────────────────────
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 동명이인 구분용. 공개 프로필에는 노출하지 않는다.
  birth_date date,
  status text not null default 'unknown'
    check (status in ('active', 'retired', 'unknown')),
  created_at timestamptz not null default now()
);
create index idx_players_name on public.players (name);

create table public.player_team_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  from_year smallint not null check (from_year between 1982 and 2100),
  to_year smallint check (to_year between 1982 and 2100),
  constraint player_team_range check (to_year is null or to_year >= from_year)
);
create index idx_player_team_player on public.player_team_history (player_id);

-- ── 문제 카테고리 ─────────────────────────────────────────────────────
create table public.question_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  sort_order smallint not null default 0
);
