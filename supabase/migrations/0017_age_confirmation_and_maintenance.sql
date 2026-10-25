-- 야구왕 — 0017 만 14세 확인과 정기 작업 기록
--
-- 1) profiles.age_confirmed_at
--    개인정보처리방침(초안)은 "만 14세 미만 아동의 회원 가입을 받지 않는다"고 적는다.
--    법정대리인 동의 절차가 없으므로, 가입 직후 **기록이 계정에 붙기 전에** 만 14세
--    이상인지 확인한다(15 문서 §3). 확인한 시각만 남긴다 — 생년월일은 받지 않는다.
--    확인 전 회원은 공식 경기 시작·비회원 기록 승계를 할 수 없다(서버에서 막는다).
--    기존 회원도 null로 시작하므로 다음 방문 때 한 번 확인받는다.
--
-- 2) maintenance_runs
--    보관 기간 파기(0016)는 운영자가 하루 한 번 돌리는 것이 원칙이다(OPERATIONS.md).
--    빠뜨려도 처리방침이 거짓이 되지 않도록, 앱이 요청을 처리하다가 마지막 실행이
--    하루를 넘었으면 한 번 돌린다. 여러 인스턴스가 동시에 돌리지 않게 이 표의
--    조건부 갱신으로 한 곳만 통과시킨다.

alter table public.profiles
  add column age_confirmed_at timestamptz;

create table public.maintenance_runs (
  job text primary key,
  last_run_at timestamptz not null
);

-- 다른 테이블과 같은 원칙: RLS를 켜되 정책을 만들지 않는다(서버 연결만 접근).
alter table public.maintenance_runs enable row level security;
