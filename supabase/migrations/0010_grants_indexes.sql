-- 야구왕 P1 — 0010 권한과 마무리
-- RLS에 더해 테이블 권한으로 2중 방어한다. RLS 정책 실수 하나로
-- 정답이나 타인 기록이 새지 않도록 한다.

-- ── private 스키마는 클라이언트에 전면 차단 ───────────────────────────
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;

alter default privileges in schema private
  revoke all on tables from anon, authenticated;
alter default privileges in schema private
  revoke all on functions from anon, authenticated;
alter default privileges in schema private
  revoke all on sequences from anon, authenticated;

-- ── 서버 전용 테이블: 권한 자체를 회수 ────────────────────────────────
revoke all on public.questions from anon, authenticated;
revoke all on public.question_sources from anon, authenticated;
revoke all on public.question_versions from anon, authenticated;
revoke all on public.question_reports from anon, authenticated;
revoke all on public.guest_sessions from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
revoke all on public.growth_events from anon, authenticated;
revoke all on public.leaderboard_entries from anon, authenticated;

-- ── 쓰기 권한 회수: 게임 기록은 서버만 변경한다 ───────────────────────
revoke insert, update, delete on public.play_sessions from anon, authenticated;
revoke insert, update, delete on public.at_bats from anon, authenticated;
revoke insert, update, delete on public.user_batting_stats from anon, authenticated;
revoke insert, update, delete on public.user_private_stats from anon, authenticated;
revoke insert, update, delete on public.xp_transactions from anon, authenticated;
revoke insert, update, delete on public.user_zone_cells from anon, authenticated;
revoke insert, update, delete on public.wrong_answer_reviews from anon, authenticated;
revoke insert, update, delete on public.review_attempts from anon, authenticated;
revoke insert, update, delete on public.teams from anon, authenticated;
revoke insert, update, delete on public.players from anon, authenticated;
revoke insert, update, delete on public.team_name_history from anon, authenticated;
revoke insert, update, delete on public.player_team_history from anon, authenticated;
revoke insert, update, delete on public.question_categories from anon, authenticated;
revoke insert, update, delete on public.seasons from anon, authenticated;

-- 프로필과 선호 설정은 P1에서도 서버 API(PATCH /me)로만 변경한다.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.user_favorite_teams from anon, authenticated;
revoke insert, update, delete on public.user_favorite_players from anon, authenticated;

-- ── 비율 지표 뷰: security_invoker 이므로 RLS를 그대로 따른다 ─────────
grant select on public.v_user_batting_rates to authenticated;

-- ── 함수 권한 ─────────────────────────────────────────────────────────
revoke all on function private.assert_question_publishable(uuid) from anon, authenticated;
revoke all on function private.questions_publish_guard() from anon, authenticated;
grant execute on function public.kst_today() to anon, authenticated;
grant execute on function public.level_for_xp(bigint) to authenticated;
