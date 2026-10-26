# 야구왕 — Supabase PostgreSQL 데이터베이스 설계

> **Firebase 무료판 안내(2026-10-26)** — 이 문서의 플랫폼 부분(Supabase·Vercel·서버 판정 등)은 16 문서(무료 플랜 Firebase 전환) §4의 "02" 줄로 바뀌었다. 본문은 그대로 둔다.

- 기준: PRD v1.0 / 2026-10-23
- 범위: 설계·마이그레이션 계획. **실제 DB 변경 없음.**

## 1. 설계 규칙

PostgreSQL UUID PK, timestamptz UTC 저장, auth.users와 profiles 1:1, 모든 변경 이력·점수 원장 보존. `public` 노출 테이블 모두 RLS, 서버 전용 정답·운영 테이블은 `private` 비노출 스키마 권장. 공개 정보만 별도 읽기 모델로 제공. `auth.uid()`를 소유권 확인에 사용하며 `user_metadata`를 권한으로 사용하지 않는다. `service_role`/secret은 서버에서만 취급.

## 2. 테이블 정의 (주요 필드 및 제약)

| 테이블 | 주요 필드 | 필수 제약/인덱스 |
|---|---|---|
| `profiles` | id PK/FK auth.users, nickname, avatar_url, onboarding_status, created_at | nickname unique; 상태 enum/check |
| `user_private_stats` | user_id PK, total_xp bigint, level, total_games, total_correct, total_wrong, updated_at | xp≥0; level 1~7; 서버 쓰기 |
| `teams` | id, canonical_name, short_name, active_from, active_to | 이름/역사 식별자; 팀 개명 이력 별도 관리 가능 |
| `players` | id, name, birth_date, status | 동명이인 구분, 검색 인덱스 |
| `player_team_history` | id, player_id, team_id, from_year, to_year | FK, 유효 기간 확인 |
| `user_favorite_teams` | user_id, team_id, rank | PK(user_id,rank), UNIQUE(user_id,team_id), rank 1~3 |
| `user_favorite_players` | user_id, player_id, rank | 동일한 유일성 제약 |
| `question_categories` | id, slug, title | slug unique |
| `questions` | id, category_id, stem, difficulty, status, season_scope, record_as_of, version | published는 승인된 버전만; 정답 미포함 |
| `private.question_options` | id, question_id, label, option_text, is_correct | 정확히 4개·정답 1개를 게시 승인 시 검증 |
| `question_sources` | id, question_id, url, source_name, verified_at, rights_note | 게시 전 검증된 출처 필수 |
| `question_versions` | id, question_id, version, snapshot, reviewer_id, reason | 감사 추적 |
| `placement_tests` | id, user_id, status, correct_count, assigned_level, started_at, completed_at | 사용자별 완료 1회 partial unique index |
| `placement_questions` | test_id, question_id, sequence, deadline_at | PK(test_id,sequence), unique(test_id,question_id) |
| `placement_answers` | test_id, question_id, option_id, is_correct, answered_at | PK(test_id,question_id) |
| `quiz_sessions` | id, user_id nullable, mode, status, score, started_at, ended_at | 비회원 guest token 서버 매핑 |
| `quiz_session_questions` | session_id, question_id, sequence, deadline_at | unique(session_id,sequence) |
| `quiz_answers` | session_id, question_id, user_id nullable, option_id, response_ms, is_correct, points | unique(session_id,question_id) 개인 세션 |
| `rooms` | id, code, host_id, status, settings, expires_at | code unique; max 2~10 |
| `room_members` | room_id, user_id, ready, joined_at, disconnected_at | PK(room_id,user_id) |
| `matches` | id, room_id, status, current_question, started_at, ended_at | 상태 전이 서버 전용 |
| `match_questions` | match_id, question_id, sequence, opened_at, deadline_at, revealed_at | unique(match_id,sequence) |
| `match_answers` | match_id, question_id, user_id, option_id, response_ms, is_correct, points, submitted_at | unique(match_id,question_id,user_id) |
| `xp_transactions` | id, user_id, amount, reason, idempotency_key, created_at | idempotency_key unique; 합계 원장 |
| `seasons` | id, name, starts_at, ends_at, status | 기간 중복 정책 |
| `leaderboard_entries` | season_id, user_id, points, wins, games, rating, rank | PK(season_id,user_id) |
| `rating_transactions` | id, season_id, user_id, match_id, delta, rating_after | official ranked만 |
| `wrong_answer_reviews` | user_id, question_id, stage, due_at, last_result, mastered_at | PK(user_id,question_id) |
| `review_attempts` | id, user_id, question_id, correct, reviewed_at | 이력 보존 |
| `promotion_attempts` | id, user_id, target_level, correct_count, passed, started_at, completed_at | 실패 24h 쿨다운 |
| `achievements` / `user_achievements` | 배지 정의 / 회원 획득 기록 | 중복 지급 방지 |
| `question_reports` | id, question_id, reporter_id, reason, status | 사용자 신고 |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, metadata, created_at | 운영자 수정 이력 |
| `growth_events` | id, anonymous_id/user_id, event_name, source, occurred_at | 최소 정보·보관 기간 설정 |

## 3. SQL 예시: 참조 테이블 이후 실행

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname varchar(16) not null unique,
  avatar_url text,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending','placement','completed')),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  short_name text not null,
  active_from smallint,
  active_to smallint
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date,
  status text not null default 'unknown'
);

create table public.user_favorite_teams (
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  rank smallint not null check (rank between 1 and 3),
  primary key (user_id, rank),
  unique (user_id, team_id)
);
create table public.user_favorite_players (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id),
  rank smallint not null check (rank between 1 and 3),
  primary key (user_id, rank),
  unique (user_id, player_id)
);

create table public.user_private_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  level smallint not null default 1 check (level between 1 and 7),
  total_games integer not null default 0 check (total_games >= 0),
  total_correct integer not null default 0 check (total_correct >= 0),
  total_wrong integer not null default 0 check (total_wrong >= 0),
  updated_at timestamptz not null default now()
);
create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount integer not null,
  reason text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_xp_user_created
  on public.xp_transactions(user_id, created_at desc);
```

**주의:** 위 SQL은 전체 마이그레이션이 아닌 핵심 DDL 샘플이다. 실행 시 `public` 테이블에 RLS를 활성화하고 권한 정책을 설정하기 전까지 Data API에 노출하지 말 것. `question_options.is_correct`는 공개 조회 API에서 반드시 차단한다.

## 4. RLS 정책 예시

```sql
alter table public.profiles enable row level security;
alter table public.user_favorite_teams enable row level security;
alter table public.user_favorite_players enable row level security;
alter table public.user_private_stats enable row level security;
alter table public.xp_transactions enable row level security;

create policy profiles_self_select on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy favorite_teams_self_select on public.user_favorite_teams
  for select to authenticated using ((select auth.uid()) = user_id);
create policy favorite_teams_self_insert on public.user_favorite_teams
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy favorite_teams_self_delete on public.user_favorite_teams
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy favorite_players_self_select on public.user_favorite_players
  for select to authenticated using ((select auth.uid()) = user_id);
create policy private_stats_self_select on public.user_private_stats
  for select to authenticated using ((select auth.uid()) = user_id);
create policy xp_self_select on public.xp_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
```

정식 마이그레이션은 선수 선호 INSERT/DELETE, 프로필 UPDATE의 USING+WITH CHECK, 최소 권한 GRANT/REVOKE, 정답 테이블 비노출, 운영자 관리 기능을 모두 포함해야 한다. `profiles` 공개 조회는 별도 제한된 공개 뷰/API로 제공. 공개 뷰를 사용할 경우 PostgreSQL 15+ `security_invoker=true` 및 RLS 확인. 보안상 서버 전용 테이블은 클라이언트 직접 INSERT/UPDATE 금지.

## 5. 원자성 및 동시성

- 답안: `(match_id,question_id,user_id)` UNIQUE + 서버 트랜잭션; 제출 시간은 서버 기록.
- XP: 원장 INSERT와 `user_private_stats.total_xp` 증가를 동일 트랜잭션에서 실행. `idempotency_key` 충돌 시 중복 지급하지 않고 기존 결과 반환.
- 레벨: XP 증가 후 현재 레벨·승급 요건 계산, 승인된 상태만 변경.
- 레벨 테스트: 사용자별 완료 1회 partial unique index, 테스트 시작/완료 시 잠금.
- 방 입장: 정원·상태 검증과 참가자 INSERT 원자적 처리.
- 팬 랭킹: 이벤트 시작 시 대표 구단 스냅샷 보관, 팀 변경 소급 적용 금지.

## 6. 인덱스 및 데이터 관리

`questions(status,category_id,difficulty)`, `players(name)`, `rooms(code)`, `match_answers(match_id,question_id)`, `wrong_answer_reviews(user_id,due_at)`, `leaderboard_entries(season_id,rank)`, `growth_events(occurred_at,event_name)` 인덱스. 개인정보/분석 이벤트 보관 기간, 삭제 요청, 백업·복구 정책을 별도 확정.

## 7. 적용 및 검증 순서

1. 새 스테이징 프로젝트 또는 로컬 Supabase 환경 준비.
2. 최신 CLI/SDK 및 공식 changelog 확인, `supabase --help` 확인.
3. `supabase migration new init_kbo_schema`로 마이그레이션 파일 생성.
4. 참조 테이블 → 회원 → 문제 → 게임 → 거래·랭킹 순서 DDL 작성.
5. RLS·GRANT/REVOKE·정답 비노출·인덱스 추가.
6. 로컬 DB 리셋/테스트, 다른 회원 데이터 접근 차단 테스트.
7. Supabase DB advisors/security 검토 및 승인 후 스테이징 적용.

공식 참고: https://supabase.com/docs/guides/database/postgres/row-level-security 및 https://supabase.com/docs/guides/api/securing-your-api
