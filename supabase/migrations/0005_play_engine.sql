-- 야구왕 P1 — 0005 경기 세션과 타석 원장
-- at_bats가 모든 지표의 단일 진실 공급원이다. 통산 성적·존 히트맵은
-- 언제든 이 원장에서 재계산할 수 있어야 한다 (07 문서 §1).

create type public.play_mode as enum
  ('trial', 'official_3', 'full_9', 'daily', 'zone_training', 'ghost');

create type public.at_bat_result as enum
  ('K', 'BB', '1B', '2B', '3B', 'HR');

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  mode public.play_mode not null,
  innings_target smallint not null default 1
    check (innings_target between 1 and 9),
  -- 고정 타석 모드(약점 코스 훈련)에서 사용. null이면 이닝제.
  pa_target smallint check (pa_target between 1 and 30),
  current_inning smallint not null default 1 check (current_inning >= 1),
  outs smallint not null default 0 check (outs between 0 and 3),
  -- 비트마스크: 1 = 1루, 2 = 2루, 4 = 3루
  bases smallint not null default 0 check (bases between 0 and 7),
  runs smallint not null default 0 check (runs >= 0),
  streak smallint not null default 0 check (streak >= 0),
  official boolean not null default false,
  -- 팬 페넌트레이스 집계용 당일 고정 구단. P1에서는 채우기만 한다.
  team_snapshot_id uuid references public.teams(id),
  ghost_challenge_id uuid,
  day_key date not null default public.kst_today(),
  status text not null default 'active'
    check (status in ('active', 'finished', 'abandoned', 'expired')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- 소유자는 회원 또는 게스트 중 정확히 하나
  constraint play_owner_exactly_one
    check (num_nonnulls(user_id, guest_session_id) = 1),
  -- 공식 집계는 회원만
  constraint official_requires_user
    check (official = false or user_id is not null),
  -- 체험 모드는 공식이 될 수 없다
  constraint trial_not_official
    check (mode <> 'trial'::public.play_mode or official = false),
  constraint ended_when_not_active
    check (status = 'active' or ended_at is not null)
);

create index idx_play_user_day on public.play_sessions (user_id, day_key desc);
create index idx_play_guest on public.play_sessions (guest_session_id);
create index idx_play_status on public.play_sessions (status, started_at desc);

-- ── 타석 원장 ─────────────────────────────────────────────────────────
create table public.at_bats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  sequence smallint not null check (sequence >= 1),
  question_id uuid not null references public.questions(id),
  inning smallint not null check (inning >= 1),
  outs_before smallint not null check (outs_before between 0 and 2),
  bases_before smallint not null check (bases_before between 0 and 7),
  opened_at timestamptz not null,
  deadline_at timestamptz not null,

  -- 제출 후 채워지는 컬럼 --------------------------------------------
  option_id uuid,
  submission_id uuid,
  submitted_at timestamptz,
  elapsed_ms integer check (elapsed_ms >= 0),
  is_correct boolean,
  result public.at_bat_result,
  upgraded boolean not null default false,
  upgrade_reason text check (upgrade_reason in ('hard', 'streak', 'both')),
  rbi smallint not null default 0 check (rbi between 0 and 4),
  bases_after smallint check (bases_after between 0 and 7),

  -- 한 경기에서 같은 순번·같은 문항은 한 번만
  unique (session_id, sequence),
  unique (session_id, question_id),
  constraint deadline_after_open check (deadline_at > opened_at),
  -- 결과가 확정되면 판정 컬럼이 함께 채워져야 한다
  constraint resolved_consistent check (
    result is null
    or (is_correct is not null and bases_after is not null and submitted_at is not null)
  ),
  -- 승급 사유는 승급했을 때만
  constraint upgrade_reason_consistent
    check ((upgrade_reason is null) or upgraded)
);

create index idx_at_bats_session_seq on public.at_bats (session_id, sequence);
create index idx_at_bats_question on public.at_bats (question_id);

-- 클라이언트 재시도(동일 submission_id)에 중복 타석이 생기지 않게 한다.
create unique index at_bats_submission_uniq
  on public.at_bats (submission_id)
  where submission_id is not null;

-- 미제출 타석 조회용 (마감 경과 처리)
create index idx_at_bats_pending
  on public.at_bats (deadline_at)
  where result is null;
