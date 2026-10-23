-- 야구왕 P1 — 0009 RLS
--
-- 원칙 (07 문서 §4):
--   1) public 스키마의 모든 테이블에 RLS를 켠다.
--   2) **쓰기 정책을 만들지 않는다.** 모든 INSERT/UPDATE/DELETE는 서버에서
--      service_role 또는 DATABASE_URL 연결로 수행한다. 점수·기록 위조 차단.
--   3) 정책이 없는 테이블은 anon/authenticated에서 접근 불가(= 서버 전용).
--   4) 권한 판정에 auth.uid()만 사용한다. JWT의 user_metadata는 쓰지 않는다.

-- ── RLS 활성화 ────────────────────────────────────────────────────────
alter table public.teams enable row level security;
alter table public.team_name_history enable row level security;
alter table public.players enable row level security;
alter table public.player_team_history enable row level security;
alter table public.question_categories enable row level security;
alter table public.questions enable row level security;
alter table public.question_sources enable row level security;
alter table public.question_versions enable row level security;
alter table public.question_reports enable row level security;
alter table public.profiles enable row level security;
alter table public.user_favorite_teams enable row level security;
alter table public.user_favorite_players enable row level security;
alter table public.audit_logs enable row level security;
alter table public.growth_events enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.play_sessions enable row level security;
alter table public.at_bats enable row level security;
alter table public.seasons enable row level security;
alter table public.user_batting_stats enable row level security;
alter table public.user_private_stats enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.wrong_answer_reviews enable row level security;
alter table public.review_attempts enable row level security;
alter table public.user_zone_cells enable row level security;

-- ── 공개 참조 데이터 (읽기 전용) ──────────────────────────────────────
create policy teams_public_select on public.teams
  for select to anon, authenticated using (true);

create policy team_name_history_public_select on public.team_name_history
  for select to anon, authenticated using (true);

create policy players_public_select on public.players
  for select to anon, authenticated using (true);

create policy player_team_history_public_select on public.player_team_history
  for select to anon, authenticated using (true);

create policy question_categories_public_select on public.question_categories
  for select to anon, authenticated using (true);

create policy seasons_public_select on public.seasons
  for select to anon, authenticated using (true);

-- ── 본인 데이터만 조회 ────────────────────────────────────────────────
create policy profiles_self_select on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy favorite_teams_self_select on public.user_favorite_teams
  for select to authenticated using ((select auth.uid()) = user_id);

create policy favorite_players_self_select on public.user_favorite_players
  for select to authenticated using ((select auth.uid()) = user_id);

create policy private_stats_self_select on public.user_private_stats
  for select to authenticated using ((select auth.uid()) = user_id);

create policy batting_stats_self_select on public.user_batting_stats
  for select to authenticated using ((select auth.uid()) = user_id);

create policy xp_self_select on public.xp_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy play_sessions_self_select on public.play_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

-- 타석은 소유 세션을 경유해 확인한다.
create policy at_bats_self_select on public.at_bats
  for select to authenticated using (
    exists (
      select 1
        from public.play_sessions s
       where s.id = at_bats.session_id
         and s.user_id = (select auth.uid())
    )
  );

create policy reviews_self_select on public.wrong_answer_reviews
  for select to authenticated using ((select auth.uid()) = user_id);

create policy review_attempts_self_select on public.review_attempts
  for select to authenticated using ((select auth.uid()) = user_id);

create policy zone_cells_self_select on public.user_zone_cells
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── 정책을 의도적으로 두지 않는 테이블 (서버 전용) ───────────────────
--   questions, question_sources, question_versions, question_reports
--     → 문항 본문·출처는 서버 API로만 제공한다. 문제은행 전수 열람을 막는다.
--   guest_sessions        → 게스트 토큰 해시. 클라이언트 접근 불가.
--   audit_logs            → 운영 감사 이력.
--   growth_events         → 퍼널 분석 원자료.
--   leaderboard_entries   → 랭킹은 서버가 최소 타석 조건을 적용해 제공한다.
--
-- 위 테이블은 RLS가 켜져 있고 정책이 없으므로 anon/authenticated는 0행을 본다.
-- at_bats.is_correct는 타석이 종료된 뒤에만 API가 내려준다 (07 문서 §4).
