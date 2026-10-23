-- 야구왕 P1 — 0003 회원 프로필
-- 온보딩은 2단계다: 닉네임 + 대표 구단 1개 (06 문서 §7.4).
-- V1의 'placement' 상태는 폐기했다.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname varchar(16) not null unique
    check (length(btrim(nickname)) between 2 and 16),
  avatar_url text,
  -- 팬 페넌트레이스 참가 구단. P1에서는 저장만 하고 집계는 P2에서 시작한다.
  primary_team_id uuid references public.teams(id),
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 선호 구단·선수 TOP3는 온보딩 필수에서 빠졌고 설정 화면에서 관리한다.
create table public.user_favorite_teams (
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  rank smallint not null check (rank between 1 and 3),
  primary key (user_id, rank),
  unique (user_id, team_id)
);

create table public.user_favorite_players (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id),
  rank smallint not null check (rank between 1 and 3),
  primary key (user_id, rank),
  unique (user_id, player_id)
);

-- 운영자 수정 이력
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_created on public.audit_logs (created_at desc);

-- 퍼널 분석 이벤트. 토큰·개인정보를 기록하지 않는다 (09 문서 §8).
create table public.growth_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text,
  user_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  source text,
  occurred_at timestamptz not null default now()
);
create index idx_growth_events on public.growth_events (occurred_at desc, event_name);
