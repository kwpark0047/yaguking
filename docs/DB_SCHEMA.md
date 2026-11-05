# 야구왕(YaguKing) 데이터베이스 스키마 문서

## 개요

Supabase(PostgreSQL) 기반. `public` 스키마와 `private` 스키마로 구분.

## 주요 테이블

### public.play_sessions

경기 세션 정보.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid | FK (users), 회원인 경우 |
| guest_session_id | uuid | FK (guest_sessions), 게스트인 경우 |
| mode | play_mode | 경기 모드 |
| innings_target | int | 목표 이닝 수 |
| pa_target | int | 목표 타석 수 |
| current_inning | int | 현재 이닝 |
| outs | int | 현재 아웃 수 |
| bases | int | 주자 상황 (비트마스크) |
| runs | int | 득점 |
| streak | int | 연속 정답 수 |
| official | boolean | 공식 경기 여부 |
| team_snapshot_id | uuid | 팀 스냅샷 |
| day_key | text | KST 일자 키 |
| status | text | active/finished/abandoned |
| ended_at | timestamptz | 종료 시각 |

### public.at_bats

타석 기록.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| session_id | uuid | FK (play_sessions) |
| sequence | int | 타석 순번 |
| question_id | uuid | FK (questions) |
| inning | int | 이닝 |
| outs_before | int | 타석 전 아웃 수 |
| bases_before | int | 타석 전 주자 상황 |
| opened_at | timestamptz | 타석 시작 시각 (DB 시계) |
| deadline_at | timestamptz | 제출 마감 시각 (15초 후) |
| option_id | uuid | 선택한 보기 |
| submission_id | text | 멱등 키 |
| submitted_at | timestamptz | 제출 시각 |
| elapsed_ms | int | 경과 시간 (ms) |
| is_correct | boolean | 정답 여부 |
| result | at_bat_result | 판정 결과 (K/BB/1B/2B/3B/HR) |
| upgraded | boolean | 승급 여부 |
| upgrade_reason | text | 승급 사유 |
| rbi | int | 타점 |
| bases_after | int | 타석 후 주자 상황 |

Unique: (session_id, question_id)

### public.questions

문항 정보 (공개).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| category_id | uuid | FK (question_categories) |
| difficulty | question_difficulty | easy/normal/hard |
| season_scope | text | 시즌 범위 |
| record_as_of | date | 기록 기준일 |
| stem | text | 문제 내용 |
| explanation | text | 해설 |
| status | text | published 등 |
| era_band | int | ERA 밴드 |
| difficulty_band | int | 난이도 밴드 |

### private.question_options

보기 정보 (정답 포함, 비공개).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| question_id | uuid | FK (questions) |
| label | text | A/B/C/D |
| option_text | text | 보기 내용 |
| is_correct | boolean | 정답 여부 |

### public.xp_transactions

XP 지급 원장.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid | FK (users) |
| amount | int | 지급 XP |
| reason | text | 지급 사유 |
| idempotency_key | text | 멱등 키 (unique) |
| created_at | timestamptz | 생성 시각 |

### public.user_private_stats

사용자 누적 통계.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| user_id | uuid | PK (users) |
| total_xp | bigint | 총 XP |
| level | int | 레벨 |
| total_games | int | 총 경기 수 |
| total_correct | int | 총 정답 수 |
| total_wrong | int | 총 오답 수 |
| updated_at | timestamptz | 수정 시각 |

### public.user_batting_stats

타격 성적.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| user_id | uuid | FK (users) |
| season_id | uuid | FK (seasons), null=통산 |
| pa | int | 타석 |
| ab | int | 타수 |
| h | int | 안타 |
| d2 | int | 2루타 |
| d3 | int | 3루타 |
| hr | int | 홈런 |
| bb | int | 볼넷 |
| so | int | 삼진 |
| r | int | 득점 |
| updated_at | timestamptz | 수정 시각 |

Unique: (user_id) where season_id is null (부분 유니크)

### public.user_zone_cells

존 히트맵 셀.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| user_id | uuid | FK (users) |
| era_band | int | ERA 밴드 |
| difficulty_band | int | 난이도 밴드 |
| attempts | int | 시도 횟수 |
| correct | int | 정답 횟수 |
| updated_at | timestamptz | 수정 시각 |

Unique: (user_id, era_band, difficulty_band)

### public.guest_sessions

게스트 세션.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| token_hash | text | 게스트 토큰 해시 |
| day_key | text | KST 일자 키 |
| innings_started | int | 시작 이닝 수 |
| claimed_by | uuid | 승계된 사용자 ID |

### public.rate_limit_counters

레이트 리밋 카운터.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| bucket | text | 버킷 이름 |
| subject | text | 요청자 식별자 (해시) |
| window_start | timestamptz | 윈도 시작 시각 |
| hits | int | 히트 수 |

Primary key: (bucket, subject, window_start)

## 함수

### public.level_for_xp(xp bigint)

XP에 따른 레벨 계산.

### public.kst_today()

KST 기준 오늘 날짜 반환.

## 인덱스

- `play_sessions(id)` PK
- `at_bats(id)` PK
- `at_bats(session_id, question_id)` Unique
- `xp_transactions(idempotency_key)` Unique
- `user_private_stats(user_id)` PK
- `user_batting_stats(user_id)` where season_id is null (부분 유니크)
- `user_zone_cells(user_id, era_band, difficulty_band)` Unique
- `rate_limit_counters(bucket, subject, window_start)` PK

## 스키마 변경 이력

변경 사항이 있을 때마다 마이그레이션 파일 추가:
- `npm run db:new`로 새 마이그레이션 생성
- `npm run db:reset`로 로컬 DB 리셋
