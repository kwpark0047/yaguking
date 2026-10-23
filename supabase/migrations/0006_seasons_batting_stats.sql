-- 야구왕 P1 — 0006 시즌과 통산 성적
-- seasons를 user_batting_stats보다 먼저 만들어야 FK가 성립한다.

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'closed')),
  constraint season_range check (ends_at > starts_at)
);
-- 동시에 active인 시즌은 하나만
create unique index seasons_single_active
  on public.seasons (status)
  where status = 'active';

-- ── 통산·시즌 누적 성적 ───────────────────────────────────────────────
-- season_id is null = 통산.
-- 07 문서 §3.4의 주석대로 식(expression) PK를 쓸 수 없으므로
-- id PK + (user_id, season_id) UNIQUE + 통산 행 부분 유니크 인덱스로 구현한다.
create table public.user_batting_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  pa integer not null default 0 check (pa >= 0),
  ab integer not null default 0 check (ab >= 0),
  h integer not null default 0 check (h >= 0),
  d2 integer not null default 0 check (d2 >= 0),
  d3 integer not null default 0 check (d3 >= 0),
  hr integer not null default 0 check (hr >= 0),
  bb integer not null default 0 check (bb >= 0),
  so integer not null default 0 check (so >= 0),
  r integer not null default 0 check (r >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, season_id),
  -- 안타 구성과 타수의 정합성
  constraint stats_hits_within_ab check (h <= ab),
  constraint stats_extra_base_within_h check (d2 + d3 + hr <= h),
  constraint stats_pa_covers_ab check (ab + bb <= pa)
);

create unique index user_batting_career_uniq
  on public.user_batting_stats (user_id)
  where season_id is null;

-- ── 비율 지표 뷰 ──────────────────────────────────────────────────────
-- security_invoker = true: 뷰가 호출자 권한과 RLS를 따른다 (PostgreSQL 15+).
-- OPS는 각 지표를 3자리로 반올림한 뒤 더한다. src/lib/engine/boxScore.ts와 동일.
create view public.v_user_batting_rates
with (security_invoker = true) as
select
  s.user_id,
  s.season_id,
  s.pa,
  s.ab,
  s.h,
  s.d2,
  s.d3,
  s.hr,
  s.bb,
  s.so,
  s.r,
  (s.h - s.d2 - s.d3 - s.hr) as singles,
  ((s.h - s.d2 - s.d3 - s.hr) + 2 * s.d2 + 3 * s.d3 + 4 * s.hr) as tb,
  case when s.ab > 0 then round(s.h::numeric / s.ab, 3) end as avg,
  case when s.pa > 0 then round((s.h + s.bb)::numeric / s.pa, 3) end as obp,
  case
    when s.ab > 0
    then round(
      ((s.h - s.d2 - s.d3 - s.hr) + 2 * s.d2 + 3 * s.d3 + 4 * s.hr)::numeric / s.ab,
      3
    )
  end as slg,
  case
    when s.ab > 0 and s.pa > 0
    then round((s.h + s.bb)::numeric / s.pa, 3)
       + round(
           ((s.h - s.d2 - s.d3 - s.hr) + 2 * s.d2 + 3 * s.d3 + 4 * s.hr)::numeric / s.ab,
           3
         )
  end as ops
from public.user_batting_stats s;
