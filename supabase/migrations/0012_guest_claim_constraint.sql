-- 야구왕 P1 — 0012 게스트 승계 제약 완화
--
-- 문제:
--   guest_sessions.claimed_by 는 profiles(id) 를 ON DELETE SET NULL 로 참조한다.
--   회원을 삭제하면 claimed_by 가 NULL 이 되는데 claimed_at 은 그대로 남아
--   `(claimed_by is null) = (claimed_at is null)` 제약을 위반한다.
--   그 결과 **승계 이력이 있는 회원은 삭제 자체가 실패한다.**
--   개인정보 처리방침에 따른 계정 삭제를 막는 결함이다.
--
-- 해결:
--   유용한 방향만 남긴다 — "승계자가 있는데 시각이 없는" 상태는 여전히 금지하고,
--   "시각은 있는데 승계자가 지워진" 상태는 허용한다. 후자는 '한때 승계되었고
--   그 계정은 이후 삭제되었다'는 사실 기록으로 의미가 있다.

alter table public.guest_sessions
  drop constraint guest_claim_consistent;

alter table public.guest_sessions
  add constraint guest_claim_consistent
  check (claimed_by is null or claimed_at is not null);
