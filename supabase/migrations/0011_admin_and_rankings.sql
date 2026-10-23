-- 야구왕 P1 — 0011 운영자 역할과 랭킹 조회 지원
--
-- 관리자 권한은 **서버에서 DB로 확인한다.** JWT의 user_metadata는 사용자가
-- 바꿀 수 있으므로 권한 판정에 쓰지 않는다 (01 문서 §7).

create table public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'reviewer'
    check (role in ('reviewer', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- 정책 없음 = 클라이언트 접근 불가. 서버만 확인한다.
revoke all on public.admin_users from anon, authenticated;

-- 랭킹 조회 인덱스
create index idx_batting_season_rate
  on public.user_batting_stats (season_id, pa desc)
  where pa > 0;

create index idx_batting_season_runs
  on public.user_batting_stats (season_id, r desc);

-- 최근 경기 조회 (대시보드)
create index idx_play_user_ended
  on public.play_sessions (user_id, ended_at desc)
  where status = 'finished';
