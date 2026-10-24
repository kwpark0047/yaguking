-- 레이트 리밋 카운터.
--
-- 왜 필요한가: 비회원 체험 상한(하루 2이닝)은 **게스트 토큰** 단위라
-- 쿠키를 버리고 새로 받으면 무한히 우회된다. 공개 URL에 올리기 전에는
-- 토큰과 무관한 축이 하나 있어야 한다.
--
-- 왜 DB인가: 배포 대상이 정해지지 않았고 Redis도 없다. 인메모리 카운터는
-- 인스턴스가 여러 개이거나 서버리스면 사실상 동작하지 않는다. 이미 모든
-- 쓰기가 지나가는 Postgres에 두는 편이 환경에 덜 의존한다.
--
-- **IP 원문을 저장하지 않는다.** `subject`에는 GUEST_TOKEN_SECRET으로
-- HMAC한 값이 들어간다. 게스트 토큰을 해시로만 보관하는 것과 같은 이유이며,
-- 개인정보 처리방침이 확정되기 전에 새 식별자를 쌓지 않기 위해서다.
--
-- 고정 윈도 방식이다. 경계에서 최대 2배까지 통과할 수 있지만, 소규모 노출에서
-- 막으려는 것은 정밀한 제어가 아니라 자동화된 반복 호출이다.

create table public.rate_limit_counters (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, subject, window_start)
);

-- 만료된 윈도를 지울 때 쓴다.
create index idx_rate_limit_window on public.rate_limit_counters (window_start);

-- 다른 테이블과 같은 원칙: RLS를 켜되 정책을 만들지 않는다.
-- 정책이 없으면 anon/authenticated는 접근할 수 없고 서버 연결로만 다룬다.
alter table public.rate_limit_counters enable row level security;
