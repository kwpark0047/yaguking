-- 야구왕 P1 — 0004 게스트 세션
-- 비회원도 서버 측 세션을 갖는다. 진행 상태를 클라이언트에 두지 않는다.
-- 쿠키 원문 토큰은 저장하지 않고 sha256 해시만 보관한다 (07 문서 §3.2).

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  -- 일자 경계는 Asia/Seoul 기준이며 값 자체는 date로 저장한다 (07 문서 §1).
  day_key date not null,
  innings_started smallint not null default 0
    check (innings_started >= 0 and innings_started <= 2),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  -- 승계는 1회만. claimed_by가 있으면 claimed_at도 있어야 한다.
  constraint guest_claim_consistent
    check ((claimed_by is null) = (claimed_at is null))
);

create index idx_guest_day on public.guest_sessions (day_key);
create index idx_guest_claimed on public.guest_sessions (claimed_by)
  where claimed_by is not null;

-- KST 현재 일자. 일일 상한·데일리 편성·집계가 모두 이 함수를 쓴다.
create or replace function public.kst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;
