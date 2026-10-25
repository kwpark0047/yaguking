-- 야구왕 — 0016 개인정보 보관 기간 경과분 파기
--
-- 왜: 개인정보처리방침에 보관 기간을 적으려면 그 기간이 지나면 실제로 지워져야
-- 한다. 지금까지는 회원 탈퇴(즉시 삭제) 말고는 지우는 경로가 없었다 — 비회원
-- 체험 기록과 로그인 기록이 무기한 쌓였다.
--
-- 기간의 단일 출처는 src/lib/privacy/retention.ts 이고, 아래 기본 인자는 그 값과
-- 같아야 한다(통합 테스트가 대조한다). 근거는 15 문서 §2.
--
--   비회원 체험 기록  마지막 이용 후 30일  guest_sessions (+ 그 경기·타석 CASCADE)
--   로그인 기록       90일                 auth.audit_log_entries
--   쓰지 않는 세션    마지막 갱신 후 90일  auth.sessions (+ refresh_tokens CASCADE)
--   레이트 리밋       1시간                rate_limit_counters
--
-- 회원 기록은 여기서 지우지 않는다 — 탈퇴할 때까지 보관하고 탈퇴 즉시 지운다
-- (src/server/me/account.ts). 가입하며 승계한 경기는 이미 회원 소유라
-- (guest_session_id = null) 게스트 행을 지워도 따라 지워지지 않는다.
--
-- 실행: `npm run privacy:purge` 를 하루 한 번(OPERATIONS.md). 여러 번 돌려도 같다.

create or replace function public.purge_expired_personal_data(
  p_guest_days integer default 30,
  p_auth_log_days integer default 90,
  p_rate_limit_hours integer default 1
)
returns table (purged_guests integer, purged_auth_logs integer, purged_sessions integer, purged_rate_limits integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guests integer;
  v_auth_logs integer;
  v_sessions integer;
  v_rate_limits integer;
begin
  -- 비회원: 마지막 이용 = 게스트 발급, 체험 일자, 가장 최근 경기 중 가장 늦은 때
  delete from public.guest_sessions gs
   where greatest(
           gs.created_at,
           (gs.day_key + 1)::timestamp at time zone 'Asia/Seoul',
           coalesce(
             (select max(coalesce(ps.ended_at, ps.started_at))
                from public.play_sessions ps
               where ps.guest_session_id = gs.id),
             gs.created_at
           )
         ) < now() - make_interval(days => p_guest_days);
  get diagnostics v_guests = row_count;

  delete from auth.audit_log_entries
   where created_at < now() - make_interval(days => p_auth_log_days);
  get diagnostics v_auth_logs = row_count;

  delete from auth.sessions
   where coalesce(refreshed_at, updated_at, created_at) < now() - make_interval(days => p_auth_log_days);
  get diagnostics v_sessions = row_count;

  delete from public.rate_limit_counters
   where window_start < now() - make_interval(hours => p_rate_limit_hours);
  get diagnostics v_rate_limits = row_count;

  return query select v_guests, v_auth_logs, v_sessions, v_rate_limits;
end;
$$;

-- 서버 연결(관리 작업)만 부른다. 클라이언트 역할에서는 막는다.
revoke all on function public.purge_expired_personal_data(integer, integer, integer)
  from public, anon, authenticated;
