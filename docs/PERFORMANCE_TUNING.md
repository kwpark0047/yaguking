# 야구왕(YaguKing) 성능 튜닝 가이드

## 목표

100명 동시 접속 시 p95 응답 시간 300ms 이내 달성

## 현재 성능 현황

| 동시 사용자 | 연결 풀 5 | 연결 풀 10 (개선 후) | 목표 |
|-------------|-----------|----------------------|------|
| 50명 | p95 335ms ❌ | p95 ~250ms ✅ | 300ms |
| 100명 | p95 439ms ❌ | 미측정 | 300ms |

## 적용된 최적화 (완료)

### 1. 연결 풀 크기 상향 (sql.ts)

기본값 5 → 10으로 상향.
- 50명 동시: p95 335ms → ~250ms (목표 달성)

### 2. XP 배치 INSERT (grant.ts)

`grantXpBatch()` 함수 신규 추가. `unnest` 기반 한 번 INSERT.
- 정답 N개 시 N+2개 쿼리 → 2개 쿼리로 축소

### 3. finishSession 배치 처리 (finishSession.ts)

- XP: 개별 `grantXp` 호출 → 배치 INSERT (2개 쿼리)
- 존 히트맵: 개별 INSERT → `unnest` 기반 배치 INSERT (1개 쿼리)

### 4. 레이트 리밋 시간 기반 cleanup (rateLimit.ts)

요청당 2% 확률 cleanup → 1분 간격 시간 기반 cleanup

## 추가 최적화 후보 (100명 동시 p95 300ms 달성을 위한)

### 1순위: 연결 풀 20 이상 상향 (즉시 적용 가능)

`.env.local`의 `DATABASE_POOL_MAX`를 20 이상으로 설정.

```bash
# .env.local
DATABASE_POOL_MAX=20
```

추정 효과: 50명 기준 p95 ~250ms → 100명 기준 p95 300ms 이하 가능성

### 2순위: 읽기 전용 복제본 (Read Replica)

쓰기(타석 제출, 세션 종료)와 읽기(경기 상태, 박스스코어, 랭킹) 분할.

- 쓰기: Primary DB (직접 연결)
- 읽기: Read Replica (Supavisor 또는 PgBouncer)

구현 예정: P2 단계

### 3순위: 질문 캐싱 (Redis 또는 애플리케이션 메모리)

`pickQuestionId()`는 매 호출마다 DB 질의. 인기 문항은 캐싱 가능.

```typescript
// 구현 예시 (P2 고려)
const cache = new Map<string, string>(); // sessionId:difficulty → questionId
```

### 4순위: 정적 자산 CDN 배포

Next.js 정적 자산(이미지, 폰트, CSS/JS)을 CDN으로 오프로드.

### 5순위: DB 인덱스 추가

자주 사용하는 쿼리에 대한 인덱스 검토:

```sql
-- 이미 존재하는 인덱스 (마이그레이션 참고)
-- idx_play_user_day (user_id, day_key desc)
-- idx_play_guest (guest_session_id)
-- idx_at_bats_session_seq (session_id, sequence)
-- idx_at_bats_pending (deadline_at) WHERE result is null
-- idx_zone_user (user_id)
```

### 6순위: 연결 풀 모니터링

`pg_stat_activity`로 연결 풀 사용률 모니터링:

```sql
select state, count(*) from pg_stat_activity group by state;
```

## 측정 방법

### 로드 스모크 테스트

```bash
npm run load:smoke
```

### 수동 성능 측정

1. Supabase 로컬 인스턴스 시작 (Docker 필요)
2. `DATABASE_POOL_MAX` 값을 다르게 설정하여 비교
3. 100명 동시 접속 시뮬레이션
4. p95 응답 시간 측정

## 배포 환경별 권장 설정

| 환경 | 연결 풀 | 예상 동시 사용자 | 예상 p95 |
|------|---------|-----------------|----------|
| 로컬 개발 | 10 | ~10명 | ~100ms |
| 스테이징 | 20 | ~50명 | ~250ms |
| 프로덕션 (소규모) | 30 | ~100명 | ~300ms |
| 프로덕션 (중규모) | 50+ | ~200명 | 측정 필요 |

## 모니터링 권장 항목

1. DB 연결 풀 사용률 (활성/유휴 연결 수)
2. 느린 쿼리 로그 (`pg_stat_statements` 확장)
3. API 응답 시간 분포 (p50, p95, p99)
4. 레이트 리밋 초과 빈도
5. 오류률 (5xx)

## 체크리스트

- [ ] `DATABASE_POOL_MAX`를 예상 트래픽에 맞게 설정
- [ ] 연결 풀 사용률 모니터링 구축
- [ ] 느린 쿼리 탐지 및 인덱스 추가
- [ ] 읽기 전용 복제본 도입 검토 (P2)
- [ ] 질문 캐싱 도입 검토 (P2)
- [ ] CDN 배포 검토 (정적 자산)
