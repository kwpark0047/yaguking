# 야구왕 V2 — 데이터 · API · 판정 엔진 델타

> **Firebase 무료판 안내(2026-10-26)** — 이 문서의 플랫폼 부분(Supabase·Vercel·서버 판정 등)은 16 문서(무료 플랜 Firebase 전환) §4의 "07" 줄로 바뀌었다. 본문은 그대로 둔다.

- 버전: 2.0 / 기준일: 2026-10-23
- 기반: `06_야구왕_V2_고도화_통합기획.md`
- 범위: V1 `02_데이터베이스_설계`, `03_API_게임로직`에 대한 **델타(추가·변경)만** 기술한다. 언급 없는 항목은 V1 그대로 유효하다.
- 상태: **설계안. 실제 DB 변경·코드 작성·배포 없음.**

---

## 1. 설계 원칙 델타

V1 원칙(UUID PK, timestamptz UTC, 전면 RLS, 정답 비노출, 서버 권한 판정, 원장 보존)을 모두 승계하고 다음을 추가한다.

1. **타석 원장(`at_bats`)이 모든 지표의 단일 진실 공급원.** 통산 성적·스카우팅 등급·존 히트맵·팬 페넌트레이스 결과는 전부 원장에서 **재계산 가능**해야 한다. 집계 테이블은 캐시로 취급한다.
2. **일자 경계는 `Asia/Seoul` 기준.** 일일 상한·데일리 콘텐츠·팬리그 집계는 KST 날짜(`day_key`)로 판단하고, 저장은 UTC를 유지한다.
3. **게스트도 서버 측 세션을 갖는다.** 비회원 진행 상태를 클라이언트에 두지 않는다. 토큰은 해시로만 저장한다.
4. **경기 상태(아웃·주자·득점)는 서버 컬럼에만 존재한다.** 클라이언트가 보낸 주자·점수·경과시간은 신뢰하지 않는다.
5. **`public` 노출 테이블 전부 RLS, 정답은 `private` 스키마 유지.**

---

## 2. 신규·변경 테이블 요약

| 테이블 | 구분 | 역할 |
|---|---|---|
| `guest_sessions` | 신규 | 비회원 세션, 일일 체험 상한, 가입 승계 대상 |
| `play_sessions` | 신규 (V1 `quiz_sessions` 대체) | 이닝 진행 상태(이닝·아웃·주자·득점·연속) |
| `at_bats` | 신규 (V1 `quiz_answers` 대체) | 타석 원장. 결과·RBI·주자 전이 보존 |
| `user_batting_stats` | 신규 | 통산·시즌 누적 성적 카운터 |
| `v_user_batting_rates` | 신규 뷰 | AVG/OBP/SLG/OPS 계산 노출 |
| `user_zone_cells` | 신규 | 스트라이크존 3×3 약점 집계 |
| `user_scouting_grades` | 신규 | 20~80 스케일 5툴 + 종합(OFP) |
| `fan_league_seasons` | 신규 | 팬 페넌트레이스 시즌·대진 방식·최소 참가 조건 |
| `fan_league_games` | 신규 | 일별 구단 맞대결 결과 |
| `fan_contributions` | 신규 | 회원별 일일 기여(구단 스냅샷 고정, 상한 3이닝) |
| `ghost_challenges` | 신규 | 고스트 도전장(문항 시퀀스·박스스코어 스냅샷) |
| `ghost_attempts` | 신규 | 도전 응답·전적 |
| `daily_feature_questions` | 신규 | "그날의 야구" 승인 문항 편성 |
| `questions` | 변경 | `era_year`, `era_band`, `irt_difficulty` 추가 |
| `profiles` | 변경 | `primary_team_id`, `onboarding_status` 값 축소 |
| `rooms` / `matches` / `match_answers` | 유지 | P3 실시간 대결용, V1 정의 그대로 |
| `wrong_answer_reviews` / `review_attempts` | 유지 | 복습 간격 1·3·7·14일 그대로 |
| `xp_transactions` / `seasons` / `audit_logs` | 유지 | V1 그대로 |
| `placement_tests` / `placement_questions` / `placement_answers` | **폐기** | 20문제 선행 테스트 폐지(§7) |

---

## 3. DDL (핵심 발췌)

> 아래는 전체 마이그레이션이 아니다. 참조 테이블(`teams`, `players`, `questions`) 이후 실행하며, **RLS·GRANT 설정 완료 전에는 Data API에 노출하지 않는다.**

### 3.1 열거형

```sql
create type public.play_mode as enum
  ('trial','official_3','full_9','daily','zone_training','ghost');

create type public.at_bat_result as enum
  ('K','BB','1B','2B','3B','HR');

create type public.fan_game_result as enum
  ('home','away','draw','void');
```

### 3.2 게스트 세션과 가입 승계

```sql
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,          -- 원문 토큰 저장 금지
  day_key date not null,                    -- KST 기준 일자
  innings_started smallint not null default 0
    check (innings_started >= 0 and innings_started <= 2),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_guest_day on public.guest_sessions(day_key);
```

- 일일 상한은 `(token_hash, day_key)` 단위로 서버가 증가시킨다. 쿠키 삭제·시크릿 모드 우회는 완전 차단이 불가하므로, **상한은 전환 유도 장치로만 취급**하고 보안 경계로 쓰지 않는다(출시 게이트 G9).
- `claimed_by`가 설정된 세션은 재승계 대상에서 제외된다(멱등성).

### 3.3 경기 세션과 타석 원장

```sql
create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  mode public.play_mode not null,
  innings_target smallint not null default 1 check (innings_target between 1 and 9),
  current_inning smallint not null default 1,
  outs smallint not null default 0 check (outs between 0 and 3),
  bases smallint not null default 0 check (bases between 0 and 7),  -- 비트: 1=1루,2=2루,4=3루
  runs smallint not null default 0 check (runs >= 0),
  streak smallint not null default 0 check (streak >= 0),
  official boolean not null default false,
  team_snapshot_id uuid references public.teams(id),   -- 팬리그 집계용 당일 고정 구단
  ghost_challenge_id uuid,
  day_key date not null,
  status text not null default 'active'
    check (status in ('active','finished','expired')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint play_owner_exactly_one
    check (num_nonnulls(user_id, guest_session_id) = 1),
  constraint official_requires_user
    check (official = false or user_id is not null)
);
create index idx_play_user_day on public.play_sessions(user_id, day_key desc);

create table public.at_bats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  sequence smallint not null check (sequence >= 1),
  question_id uuid not null references public.questions(id),
  inning smallint not null,
  outs_before smallint not null check (outs_before between 0 and 2),
  bases_before smallint not null check (bases_before between 0 and 7),
  opened_at timestamptz not null,
  deadline_at timestamptz not null,
  -- 제출 후 채워지는 컬럼
  option_id uuid,
  submission_id uuid,
  submitted_at timestamptz,
  elapsed_ms integer check (elapsed_ms >= 0),
  is_correct boolean,
  result public.at_bat_result,
  upgraded boolean not null default false,
  rbi smallint not null default 0 check (rbi between 0 and 4),
  bases_after smallint check (bases_after between 0 and 7),
  unique (session_id, sequence),
  unique (session_id, question_id)
);
create unique index at_bats_submission_uniq
  on public.at_bats(submission_id) where submission_id is not null;
create index idx_at_bats_question on public.at_bats(question_id);
```

- `unique (session_id, question_id)`: 한 경기에서 같은 문항 재출제 금지.
- `at_bats_submission_uniq`: 클라이언트 재시도(동일 `submissionId`)에 대해 중복 타석 생성 차단 → V1 `ALREADY_SUBMITTED` 규약과 동일하게 **기존 결과를 그대로 반환**한다.
- 미제출 타석은 마감 경과 시 배치 또는 다음 요청 시점에 `result='K'`로 확정한다.

### 3.4 통산 성적

```sql
create table public.user_batting_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid references public.seasons(id),   -- null = 통산
  pa integer not null default 0 check (pa >= 0),
  ab integer not null default 0 check (ab >= 0),
  h  integer not null default 0 check (h  >= 0),
  d2 integer not null default 0 check (d2 >= 0),
  d3 integer not null default 0 check (d3 >= 0),
  hr integer not null default 0 check (hr >= 0),
  bb integer not null default 0 check (bb >= 0),
  so integer not null default 0 check (so >= 0),
  r  integer not null default 0 check (r  >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
```

> PK에 식(expression)을 쓸 수 없으므로 실제 마이그레이션에서는 `season_id`를 `not null`로 두고 통산용 **센티넬 시즌 행**을 사용하거나, `(user_id, season_id)` 복합 UNIQUE + 별도 `id` PK에 `season_id is null` 부분 유니크 인덱스를 추가한다. 후자를 권장한다.

```sql
create view public.v_user_batting_rates
with (security_invoker = true) as
select
  user_id,
  season_id,
  pa, ab, h, d2, d3, hr, bb, so, r,
  (h - d2 - d3 - hr) as singles,
  ((h - d2 - d3 - hr) + 2*d2 + 3*d3 + 4*hr) as tb,
  case when ab > 0 then round(h::numeric / ab, 3) end as avg,
  case when pa > 0 then round((h + bb)::numeric / pa, 3) end as obp,
  case when ab > 0 then round(((h - d2 - d3 - hr) + 2*d2 + 3*d3 + 4*hr)::numeric / ab, 3) end as slg,
  case when ab > 0 and pa > 0 then
    round((h + bb)::numeric / pa, 3)
    + round(((h - d2 - d3 - hr) + 2*d2 + 3*d3 + 4*hr)::numeric / ab, 3)
  end as ops
from public.user_batting_stats;
```

`security_invoker = true`는 PostgreSQL 15+에서 뷰가 호출자 권한·RLS를 따르게 한다(V1 §4 지침 승계).

### 3.5 존 히트맵과 스카우팅 등급

```sql
alter table public.questions
  add column era_year smallint check (era_year between 1982 and 2100),
  add column irt_difficulty numeric(4,2),   -- 적응형 추정용 난이도 파라미터
  add column era_band smallint generated always as (
    case
      when era_year is null then null
      when era_year <= 1999 then 1
      when era_year <= 2014 then 2
      else 3
    end
  ) stored;

create table public.user_zone_cells (
  user_id uuid not null references public.profiles(id) on delete cascade,
  era_band smallint not null check (era_band between 1 and 3),
  difficulty_band smallint not null check (difficulty_band between 1 and 3),
  attempts integer not null default 0 check (attempts >= 0),
  correct  integer not null default 0 check (correct >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, era_band, difficulty_band),
  constraint zone_correct_le_attempts check (correct <= attempts)
);

create table public.user_scouting_grades (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  contact smallint check (contact between 20 and 80),
  power   smallint check (power   between 20 and 80),
  speed   smallint check (speed   between 20 and 80),
  field   smallint check (field   between 20 and 80),
  arm     smallint check (arm     between 20 and 80),
  ofp     smallint check (ofp     between 20 and 80),
  sample_pa integer not null default 0,
  status text not null default 'observing'
    check (status in ('observing','published')),
  updated_at timestamptz not null default now()
);
```

`difficulty_band`: 초급 1, 중급 2, 고급 3. `era_band`: 1982~1999 / 2000~2014 / 2015~현재.

### 3.6 팬 페넌트레이스

```sql
create table public.fan_league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  pairing_mode text not null check (pairing_mode in ('schedule','roundrobin')),
  min_fans smallint not null default 10 check (min_fans >= 1),
  status text not null default 'scheduled'
    check (status in ('scheduled','active','closed')),
  check (ends_on >= starts_on)
);

create table public.fan_league_games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.fan_league_seasons(id) on delete cascade,
  game_date date not null,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  home_fans integer not null default 0,
  away_fans integer not null default 0,
  home_ops numeric(5,3),
  away_ops numeric(5,3),
  result public.fan_game_result,
  computed_at timestamptz,
  check (home_team_id <> away_team_id),
  unique (season_id, game_date, home_team_id),
  unique (season_id, game_date, away_team_id)
);
create index idx_fan_games_date on public.fan_league_games(game_date desc);

create table public.fan_contributions (
  game_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),   -- 당일 00:00 스냅샷. 변경 소급 금지
  innings_counted smallint not null default 0
    check (innings_counted between 0 and 3),
  pa integer not null default 0,
  ab integer not null default 0,
  h  integer not null default 0,
  tb integer not null default 0,
  bb integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_date, user_id)
);
create index idx_fan_contrib_team_date on public.fan_contributions(team_id, game_date);
```

**집계 정의 (멱등 재계산 가능)**

```sql
-- 특정 일자의 구단 집계. 원장에서 언제든 재계산한다.
with team_agg as (
  select team_id,
         count(*) filter (where pa > 0)            as fans,
         sum(h + bb)::numeric                      as on_base,
         sum(pa)::numeric                          as pa,
         sum(tb)::numeric                          as tb,
         sum(ab)::numeric                          as ab
  from public.fan_contributions
  where game_date = $1
  group by team_id
)
select team_id,
       fans,
       case when pa > 0 and ab > 0
            then round(on_base / pa, 3) + round(tb / ab, 3)
       end as ops
from team_agg;
```

- 양 팀 중 한쪽이라도 `fans < min_fans`면 `result='void'` (승률 계산 제외).
- OPS 동일 시 `draw`. 소수 3자리까지 비교하며 그 이하는 버린다.
- `innings_counted`는 **당일 첫 공식 3이닝까지만** 증가하고, 그 이후 타석은 개인 기록에는 쌓이되 팬 기여에는 들어가지 않는다.

### 3.7 고스트 대결

```sql
create table public.ghost_challenges (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_guest_id uuid references public.guest_sessions(id) on delete set null,
  source_session_id uuid not null references public.play_sessions(id) on delete cascade,
  question_sequence jsonb not null,   -- [{ "questionId": "...", "optionOrder": ["a","c","b","d"] }]
  box_score jsonb not null,           -- 공개용 요약(정답 정보 포함 금지)
  runs smallint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ghost_owner_exactly_one
    check (num_nonnulls(owner_user_id, owner_guest_id) = 1)
);

create table public.ghost_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.ghost_challenges(id) on delete cascade,
  challenger_user_id uuid references public.profiles(id) on delete cascade,
  challenger_guest_id uuid references public.guest_sessions(id) on delete cascade,
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  runs smallint not null,
  result text not null check (result in ('win','lose','draw')),
  counted boolean not null default true,   -- 재응시는 false (전적 미반영)
  created_at timestamptz not null default now(),
  constraint ghost_challenger_exactly_one
    check (num_nonnulls(challenger_user_id, challenger_guest_id) = 1)
);
create unique index ghost_attempt_member_once
  on public.ghost_attempts(challenge_id, challenger_user_id)
  where challenger_user_id is not null and counted = true;
```

`box_score`에는 **정답·해설·`is_correct`를 넣지 않는다.** 타석 결과(`HR`, `K` 등)와 시간만 담는다. 문항 시퀀스는 도전자가 해당 링크를 열 때만 서버가 순차 제공하며, 전체 목록을 선노출하지 않는다.

### 3.8 그날의 야구

```sql
create table public.daily_feature_questions (
  feature_date date not null,
  sequence smallint not null check (sequence between 1 and 10),
  question_id uuid not null references public.questions(id),
  theme text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  primary key (feature_date, sequence),
  unique (feature_date, question_id),
  constraint daily_requires_approval
    check (approved_by is not null and approved_at is not null)
);
```

자동 생성 초안은 `questions.status='draft'`로만 들어가고, **승인 없이는 이 테이블에 편성될 수 없다.**

### 3.9 프로필 변경

```sql
alter table public.profiles
  add column primary_team_id uuid references public.teams(id);

-- 온보딩 단계 축소: pending → completed (placement 단계 제거)
alter table public.profiles drop constraint profiles_onboarding_status_check;
alter table public.profiles add constraint profiles_onboarding_status_check
  check (onboarding_status in ('pending','completed'));
```

`user_favorite_teams` / `user_favorite_players`는 테이블째 유지하되 **온보딩 필수에서 제외**하고 설정 화면에서 관리한다. `primary_team_id`는 페넌트레이스 참가 조건이며, 변경 시 당일 집계에 소급 반영하지 않는다.

---

## 4. RLS 정책 델타

```sql
alter table public.play_sessions      enable row level security;
alter table public.at_bats            enable row level security;
alter table public.user_batting_stats enable row level security;
alter table public.user_zone_cells    enable row level security;
alter table public.user_scouting_grades enable row level security;
alter table public.fan_contributions  enable row level security;
alter table public.ghost_attempts     enable row level security;
alter table public.guest_sessions     enable row level security;   -- 정책 없음 = 전면 차단

-- 본인 세션 조회만 허용. INSERT/UPDATE는 서버(service_role) 전용
create policy play_sessions_self_select on public.play_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy at_bats_self_select on public.at_bats
  for select to authenticated using (
    exists (
      select 1 from public.play_sessions s
      where s.id = at_bats.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy batting_stats_self_select on public.user_batting_stats
  for select to authenticated using ((select auth.uid()) = user_id);

create policy zone_cells_self_select on public.user_zone_cells
  for select to authenticated using ((select auth.uid()) = user_id);

create policy scouting_self_select on public.user_scouting_grades
  for select to authenticated using ((select auth.uid()) = user_id);

create policy fan_contrib_self_select on public.fan_contributions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy ghost_attempt_self_select on public.ghost_attempts
  for select to authenticated using ((select auth.uid()) = challenger_user_id);
```

- **쓰기 정책을 만들지 않는다.** 모든 INSERT/UPDATE는 서버 라우트에서 `service_role`로 수행한다(점수·기록 위조 차단). `at_bats`는 클라이언트에 INSERT 권한을 절대 부여하지 않는다.
- `guest_sessions`는 RLS 활성 + 정책 0개 → 익명/인증 클라이언트 모두 직접 접근 불가, 서버만 취급.
- `fan_league_games` / `fan_league_seasons` / `v_user_batting_rates`의 공개 랭킹은 **집계만 담은 별도 공개 뷰 또는 API**로 제공하고, 개인 식별 정보를 섞지 않는다.
- `at_bats.option_id`가 정답인지 여부는 `is_correct` 컬럼으로만 노출되며, **해당 타석이 종료(결과 확정)된 뒤에만** API가 내려준다.

---

## 5. 판정 엔진 (서버 전용)

### 5.1 타석 결과 결정

```ts
export type AtBatResult = 'K' | 'BB' | '1B' | '2B' | '3B' | 'HR';
export type Difficulty = 'easy' | 'normal' | 'hard';

const LADDER: readonly AtBatResult[] = ['BB', '1B', '2B', '3B', 'HR'];
const LIMIT_MS = 15_000;

/**
 * 모든 인자는 서버가 확정한 값만 사용한다.
 * elapsedMs = received_at - opened_at (클라이언트 제공 값 금지)
 */
export function resolveAtBat(
  correct: boolean,
  elapsedMs: number,
  difficulty: Difficulty,
  streakBefore: number,
): { result: AtBatResult; upgraded: boolean; streakAfter: number } {
  if (!correct || elapsedMs > LIMIT_MS) {
    return { result: 'K', upgraded: false, streakAfter: 0 };
  }

  const t = Math.max(0, elapsedMs);
  const base: AtBatResult =
    t <= 2_000 ? 'HR' :
    t <= 4_500 ? '2B' :
    t <= 8_000 ? '1B' : 'BB';

  const streakAfter = streakBefore + 1;
  const eligible = difficulty === 'hard' || streakAfter >= 5;

  if (!eligible || base === 'HR') {
    return { result: base, upgraded: false, streakAfter };
  }

  // 승급은 타석당 최대 1단계
  const next = LADDER[LADDER.indexOf(base) + 1];
  return { result: next, upgraded: true, streakAfter };
}
```

### 5.2 주자 진루

`bases`는 비트마스크(1=1루, 2=2루, 4=3루)로 저장한다.

```ts
export function advanceRunners(
  bases: number,
  result: AtBatResult,
): { bases: number; runs: number } {
  const b1 = (bases & 1) !== 0;
  const b2 = (bases & 2) !== 0;
  const b3 = (bases & 4) !== 0;
  const pack = (n1: boolean, n2: boolean, n3: boolean) =>
    (n1 ? 1 : 0) | (n2 ? 2 : 0) | (n3 ? 4 : 0);

  switch (result) {
    case 'K':
      return { bases, runs: 0 };

    case 'BB': {
      // 강제 진루만
      if (!b1) return { bases: pack(true, b2, b3), runs: 0 };
      if (!b2) return { bases: pack(true, true, b3), runs: 0 };
      if (!b3) return { bases: pack(true, true, true), runs: 0 };
      return { bases: pack(true, true, true), runs: 1 };   // 만루 밀어내기
    }

    case '1B':
      // 전 주자 1베이스 진루
      return { bases: pack(true, b1, b2), runs: b3 ? 1 : 0 };

    case '2B':
      // 전 주자 2베이스 진루
      return { bases: pack(false, true, b1), runs: (b2 ? 1 : 0) + (b3 ? 1 : 0) };

    case '3B':
      // 주자 전원 득점, 타자 3루
      return { bases: pack(false, false, true), runs: (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0) };

    case 'HR':
      return { bases: 0, runs: (b1 ? 1 : 0) + (b2 ? 1 : 0) + (b3 ? 1 : 0) + 1 };
  }
}
```

### 5.3 이닝·세션 진행

```ts
export function applyAtBat(
  s: { inning: number; outs: number; bases: number; runs: number; inningsTarget: number },
  result: AtBatResult,
) {
  const { bases, runs } = advanceRunners(s.bases, result);
  let { inning, outs } = s;
  let nextBases = bases;

  if (result === 'K') {
    outs += 1;
    if (outs >= 3) {           // 이닝 종료 → 주자·아웃 초기화
      inning += 1;
      outs = 0;
      nextBases = 0;
    }
  }

  const finished = inning > s.inningsTarget;
  return {
    inning,
    outs,
    bases: nextBases,
    runs: s.runs + runs,
    rbi: runs,
    finished,
  };
}
```

**고정 타석 모드**: `zone_training`(5타석)처럼 아웃이 아닌 타석 수로 끝나는 모드는 `inningsTarget` 대신 `paTarget`을 사용하고, 종료 조건만 `sequence >= paTarget`으로 교체한다. 판정·진루 로직은 동일하게 재사용한다.

**세션 종료 처리**: `finished`가 되면 동일 트랜잭션에서 ① `play_sessions.status='finished'` ② `user_batting_stats` 증분 ③ `user_zone_cells` 증분 ④ 공식 경기면 `fan_contributions` 증분(3이닝 상한 내) ⑤ XP 원장 INSERT를 **원자적으로** 수행한다. 어느 하나라도 실패하면 전부 롤백한다.

### 5.4 스카우팅 등급 산출

```ts
/** 백분위(0~1)를 20~80 스케일 5단위로 환산 */
export function toScoutingGrade(percentile: number): number {
  const raw = 20 + percentile * 60;
  return Math.min(80, Math.max(20, Math.round(raw / 5) * 5));
}
```

| 툴 | 원지표 | 방향 |
|---|---|---|
| 컨택 | 전체 정답률 | 높을수록 ↑ |
| 파워 | 고급 난이도 정답률 | 높을수록 ↑ |
| 주력 | 정답 타석 평균 응답시간 | **낮을수록 ↑** (백분위 반전) |
| 수비 | `야구 규칙·상식` 정답률 | 높을수록 ↑ |
| 송구 | `선수 기록` + `구단 역사` 정답률 | 높을수록 ↑ |
| 종합(OFP) | `0.3·컨택 + 0.2·파워 + 0.2·주력 + 0.15·수비 + 0.15·송구` | — |

백분위는 **전체 회원 분포 기준**으로 일 1회 배치 갱신한다. 지표별 유효 표본 20타석 미달 시 해당 툴은 `null` + 상태 `observing`으로 두고, 누적 30타석에서 `published`로 전환한다(V1 `placement_grant` 1회 지급 규칙을 이 시점에 적용).

---

## 6. API 델타

### 6.1 신규·대체 엔드포인트

| Method | Path | 권한 | 기능 |
|---|---|---|---|
| POST | `/api/v1/play/sessions` | 공개(게스트 쿠키) / 회원 | 경기 시작. 모드·이닝 수 지정 |
| GET | `/api/v1/play/sessions/{id}` | 소유자 | 현재 타석·스코어보드 복원 |
| POST | `/api/v1/play/sessions/{id}/at-bats` | 소유자 | 타석 제출 → 결과·주자·득점 반환 |
| POST | `/api/v1/play/sessions/{id}/abandon` | 소유자 | 중도 종료(기록은 보존, 공식 집계 제외) |
| GET | `/api/v1/play/sessions/{id}/box-score` | 공개(토큰) | 박스스코어·공유 카드 데이터 |
| POST | `/api/v1/auth/claim-guest` | 회원 | **게스트 기록 승계(멱등)** |
| GET | `/api/v1/me/batting` | 회원 | 통산·시즌 성적, 비율 지표 |
| GET | `/api/v1/me/scouting` | 회원 | 5툴 등급 + 상태 |
| GET | `/api/v1/me/zone` | 회원 | 3×3 존 히트맵 |
| POST | `/api/v1/training/zone` | 회원 | 지정 칸 5타석 훈련 세션 생성 |
| GET | `/api/v1/fan-league/today` | 공개 | 오늘 대진·실시간 집계·내 기여 |
| GET | `/api/v1/fan-league/standings` | 공개 | 승률·게임차 순위표 |
| POST | `/api/v1/ghost/challenges` | 공개(게스트 1회) / 회원 | 도전장 생성 |
| GET | `/api/v1/ghost/{token}` | 공개 | 도전장 요약(문항 선노출 금지) |
| POST | `/api/v1/ghost/{token}/attempts` | 공개 / 회원 | 응답 세션 생성 |
| GET | `/api/v1/daily/today` | 공개 | "그날의 야구" 테마·편성 |

**폐기**: `/placement/*` 전체. **유지**: `/me`, `/teams`, `/players`, `/rooms/*`, `/matches/*`(P3), `/me/wrong-answers`, `/reviews/*`, `/rankings/*`.

응답 규격·오류 코드는 V1 그대로(`{success, data}` / `{success, error:{code,message,requestId}}`).

### 6.2 요청·응답 예시

**경기 시작**

```json
POST /api/v1/play/sessions
{ "mode": "trial", "inningsTarget": 1 }
```

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "mode": "trial",
    "official": false,
    "scoreboard": { "inning": 1, "outs": 0, "bases": 0, "runs": 0 },
    "atBat": {
      "sequence": 1,
      "questionId": "550e8400-e29b-41d4-a716-446655440001",
      "category": "한국시리즈",
      "difficulty": "normal",
      "recordAsOf": "2025-10-31",
      "stem": "...",
      "options": [
        { "id": "...", "label": "A", "text": "..." },
        { "id": "...", "label": "B", "text": "..." },
        { "id": "...", "label": "C", "text": "..." },
        { "id": "...", "label": "D", "text": "..." }
      ],
      "deadlineAt": "2026-10-23T05:00:15.000Z"
    },
    "guestTrialRemaining": 1
  }
}
```

> 응답에 `isCorrect`·정답 ID·해설이 포함되지 않는다(V1 원칙).

**타석 제출**

```json
POST /api/v1/play/sessions/{id}/at-bats
{
  "sequence": 1,
  "optionId": "550e8400-e29b-41d4-a716-446655440002",
  "submissionId": "550e8400-e29b-41d4-a716-446655440003"
}
```

```json
{
  "success": true,
  "data": {
    "result": "2B",
    "upgraded": false,
    "isCorrect": true,
    "elapsedMs": 3420,
    "rbi": 1,
    "explanation": "...",
    "sources": [{ "name": "KBO 기록실", "verifiedAt": "2026-09-01" }],
    "scoreboard": { "inning": 1, "outs": 0, "bases": 2, "runs": 1 },
    "streak": 3,
    "next": { "sequence": 2, "questionId": "...", "deadlineAt": "..." },
    "finished": false
  }
}
```

동일 `submissionId` 재요청 시 **동일 응답을 그대로 반환**한다(새 타석 생성·중복 집계 없음). 마감 경과 제출은 `ANSWER_DEADLINE_EXCEEDED`(422)와 함께 해당 타석을 `K`로 확정한다.

**게스트 승계**

```json
POST /api/v1/auth/claim-guest
{ "guestToken": "<httpOnly 쿠키에서 서버가 직접 읽음 — 본문 전달 불필요>" }
```

```json
{
  "success": true,
  "data": {
    "claimedSessions": 2,
    "migrated": { "pa": 9, "ab": 8, "h": 3, "hr": 1, "r": 2 },
    "career": { "avg": 0.375, "ops": 1.042 },
    "alreadyClaimed": false
  }
}
```

멱등 보장: `guest_sessions.claimed_by`가 이미 설정된 경우 `alreadyClaimed: true`와 기존 결과를 반환하며 **두 번 적립하지 않는다**(출시 게이트 G7).

**오늘의 팬 페넌트레이스**

```json
{
  "success": true,
  "data": {
    "date": "2026-10-23",
    "games": [
      {
        "home": { "teamId": "...", "name": "A구단", "ops": 0.812, "fans": 143 },
        "away": { "teamId": "...", "name": "B구단", "ops": 0.790, "fans": 121 },
        "status": "live"
      }
    ],
    "me": { "teamId": "...", "inningsCounted": 1, "cap": 3, "pa": 4 }
  }
}
```

### 6.3 오류 코드 추가

| 코드 | HTTP | 상황 |
|---|---|---|
| `GUEST_TRIAL_EXHAUSTED` | 429 | 비회원 일일 체험 2이닝 초과 |
| `MEMBERSHIP_REQUIRED` | 403 | 공식 모드·전적 기록·복수전 링크 요청 |
| `SESSION_FINISHED` | 409 | 종료된 세션에 타석 제출 |
| `SEQUENCE_MISMATCH` | 409 | 서버 현재 타석과 다른 `sequence` 제출 |
| `GUEST_ALREADY_CLAIMED` | 200(`alreadyClaimed`) | 승계 재호출 — 오류가 아닌 멱등 응답 |
| `CHALLENGE_EXPIRED` | 410 | 고스트 링크 만료 |
| `FAN_LEAGUE_NOT_READY` | 409 | 최소 참가 팬 수 미달 상태 |

V1 코드(`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `ALREADY_SUBMITTED`, `ROOM_FULL`, `ROOM_EXPIRED`, `ANSWER_DEADLINE_EXCEEDED`, `RATE_LIMITED`, `INTERNAL_ERROR`)는 그대로 유효하다.

---

## 7. 폐기 항목 처리

| 대상 | 처리 |
|---|---|
| `placement_tests`, `placement_questions`, `placement_answers` | 신규 구축이므로 **생성하지 않음**. 기존 환경이 있다면 `drop` 전 백업 후 단독 마이그레이션 |
| `/placement/*` 엔드포인트 | 구현하지 않음 |
| `quiz_sessions`, `quiz_session_questions`, `quiz_answers` | `play_sessions` / `at_bats`로 대체. 기존 데이터가 있을 경우 1회성 변환 스크립트(점수 → 결과 역산은 불가하므로 통산 성적은 전환하지 않고 "V1 기록" 으로 분리 보존) |
| `placement_grant` XP 사유 | **유지**. 지급 시점만 "20문제 테스트 완료" → "누적 30타석 등급 발급"으로 변경 |

---

## 8. 인덱스 델타

```sql
create index idx_at_bats_session_seq on public.at_bats(session_id, sequence);
create index idx_play_sessions_status on public.play_sessions(status, started_at desc);
create index idx_questions_pool
  on public.questions(status, category_id, difficulty, era_band);
create index idx_fan_contrib_date on public.fan_contributions(game_date);
create index idx_ghost_token on public.ghost_challenges(token);
create index idx_ghost_expires on public.ghost_challenges(expires_at);
create index idx_daily_date on public.daily_feature_questions(feature_date);
```

랭킹 조회는 `v_user_batting_rates`에 대한 직접 질의 대신 **일 1회 갱신되는 머티리얼라이즈드 뷰 또는 `leaderboard_entries` 캐시**를 사용한다(V1 테이블 재활용).

---

## 9. 멱등성·동시성 체크리스트

| 상황 | 보장 수단 |
|---|---|
| 동일 타석 중복 제출 | `at_bats_submission_uniq` + `unique(session_id, sequence)` → 기존 결과 반환 |
| 네트워크 실패 후 재시도 | 클라이언트는 재시도 전 `GET /play/sessions/{id}`로 확정 여부 확인(V1 UX 규칙 승계) |
| 게스트 승계 동시 2회 | `guest_sessions` 행 `select ... for update` + `claimed_by` 단일 설정 |
| XP 중복 지급 | `xp_transactions.idempotency_key = eventType:sessionId:userId` UNIQUE |
| 팬 기여 상한 초과 | `fan_contributions.innings_counted <= 3` CHECK + 트랜잭션 내 증분 |
| 팬리그 결과 재계산 | 원장 기반 재계산 후 `fan_league_games` UPSERT, `computed_at` 갱신 |
| 통산 성적 드리프트 | 주 1회 원장 전량 재집계 후 `user_batting_stats`와 대조, 불일치 시 알림 |
| 마감 경합 | 서버 `received_at` 단일 기준(V1 고정), 타석 확정은 `for update` 잠금 하에서 수행 |

---

## 10. 우선 테스트 케이스 (V1 목록에 추가)

| # | 케이스 | 기대 |
|---|---|---|
| 1 | `resolveAtBat(true, 2000, 'normal', 0)` | `HR` (경계 포함) |
| 2 | `resolveAtBat(true, 2001, 'normal', 0)` | `2B` |
| 3 | `resolveAtBat(true, 4500, 'normal', 0)` | `2B` |
| 4 | `resolveAtBat(true, 4501, 'normal', 0)` | `1B` |
| 5 | `resolveAtBat(true, 8000, 'normal', 0)` | `1B` |
| 6 | `resolveAtBat(true, 8001, 'normal', 0)` | `BB` |
| 7 | `resolveAtBat(true, 15000, 'normal', 0)` | `BB` |
| 8 | `resolveAtBat(true, 15001, 'normal', 0)` | `K`, streak 0 |
| 9 | `resolveAtBat(true, 4500, 'hard', 0)` | `3B`, `upgraded=true` |
| 10 | `resolveAtBat(true, 4500, 'hard', 7)` | `3B` (승급 **최대 1단계** 확인) |
| 11 | `resolveAtBat(true, 1500, 'hard', 9)` | `HR` (상한 초과 승급 없음) |
| 12 | `advanceRunners(7, 'BB')` | 만루 밀어내기 `runs=1`, bases 7 유지 |
| 13 | `advanceRunners(1, '2B')` | bases `6`(2·3루), `runs=0` |
| 14 | `advanceRunners(7, 'HR')` | bases `0`, `runs=4` |
| 15 | 3연속 `K` | 이닝 +1, outs 0, bases 0 |
| 16 | 1이닝 목표에서 3아웃 | `finished=true`, 이후 제출은 `SESSION_FINISHED` |
| 17 | 동일 `submissionId` 2회 | 타석 1개, 통산 성적 1회 반영 |
| 18 | 비회원 3번째 체험 시작 | `GUEST_TRIAL_EXHAUSTED` |
| 19 | 게스트 승계 2회 호출 | `alreadyClaimed=true`, 성적 중복 없음 |
| 20 | 승계 동시 2요청 | 하나만 성공, 집계 1회 |
| 21 | 당일 4번째 공식 이닝 | 개인 성적 반영, `fan_contributions` 미증가 |
| 22 | 팬리그 최소 참가 미달 | `result='void'`, 승률 계산 제외 |
| 23 | 대표 구단 변경 | 당일 기여 `team_id` 불변, 익일부터 적용 |
| 24 | 팬리그 원장 재계산 | 저장된 승패와 100% 일치 |
| 25 | 고스트 링크 동일 회원 재응시 | `counted=false`, 전적 미반영 |
| 26 | 만료 링크 응답 | `CHALLENGE_EXPIRED` |
| 27 | `GET /ghost/{token}` 응답 | 문항 전체 목록·정답 미포함 |
| 28 | 타인 `at_bats` 조회 | RLS 차단 |
| 29 | 클라이언트 `at_bats` 직접 INSERT | 권한 거부 |
| 30 | 타석 진행 중 API 응답 | 정답·해설·`is_correct` 미포함 |

V1 테스트 1~12번(구단/선수 중복, 점수 경계, 10인 대결, 재접속, 복습 간격, RLS, 초대 링크 복귀)은 해당 기능 구현 단계에서 그대로 수행한다.

---

## 11. 적용 순서

1. 로컬 또는 신규 스테이징 Supabase 환경 준비(**기존 운영 DB 사용 금지**).
2. CLI·SDK 최신 버전 및 공식 changelog 확인.
3. `supabase migration new v2_at_bat_engine` — 열거형 → 게스트 → 세션·타석 → 성적·존·스카우팅 → 팬리그 → 고스트 → 데일리 순서.
4. RLS 활성화, 쓰기 정책 **미생성** 확인, `GRANT/REVOKE` 최소 권한, 정답 테이블 비노출 재확인.
5. 판정 엔진 단위 테스트(§10의 1~16) 선행 → 통합 테스트 → E2E.
6. Supabase advisors / security lint 검토.
7. 승인 후 스테이징 적용, 백업·롤백 리허설.

참고: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/guides/api/securing-your-api

**본 문서는 설계안이다. 실제 마이그레이션 실행·운영 DB 변경·배포는 사용자 승인 후에만 수행한다.**
