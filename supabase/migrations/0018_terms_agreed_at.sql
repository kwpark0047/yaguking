-- 야구왕 — 0018 약관 동의 시각 기록
--
-- 이용약관(11 문서 §2.1, 시행일 2026-11-05) 확정 후,
-- 회원가입 시 약관 동의 시각을 profiles에 기록한다.
-- 이 값이 null이면 사용자는 약관에 동의하지 않은 것으로 간주하며,
-- 서버에서 공식 경기 시작·기록 승계 등을 차단할 수 있다.
-- 기존 회원은 null로 시작하므로 다음 방문 시 한 번 동의받는다.

alter table public.profiles
  add column terms_agreed_at timestamptz;

-- 약관 동의 현황을 빠르게 조회하기 위한 인덱스 (미동의 사용자 필터링용)
create index idx_profiles_terms_agreed_at on public.profiles (terms_agreed_at)
  where terms_agreed_at is null;
