# 야구왕(YaguKing) API 문서

## 공통 응답 형식

모든 API 응답은 다음 형식을 따릅니다.

성공:
```json
{
  "success": true,
  "data": { ... }
}
```

실패:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청 값을 확인해 주세요.",
    "requestId": "req_xxxx",
    "detail": { ... } // 선택 사항
  }
}
```

모든 응답에는 `Cache-Control: no-store, no-cache, must-revalidate` 헤더가 포함됩니다.

## 오류 코드

| 코드 | HTTP 상태 | 메시지 |
|------|-----------|--------|
| VALIDATION_ERROR | 400 | 요청 값을 확인해 주세요. |
| UNAUTHORIZED | 401 | 로그인이 필요합니다. |
| FORBIDDEN | 403 | 권한이 없습니다. |
| MEMBERSHIP_REQUIRED | 403 | 회원만 이용할 수 있습니다. |
| AGE_CONFIRMATION_REQUIRED | 403 | 만 14세 이상인지 먼저 확인해 주세요. |
| NOT_FOUND | 404 | 대상을 찾을 수 없습니다. |
| ALREADY_SUBMITTED | 409 | 이미 제출된 타석입니다. |
| SEQUENCE_MISMATCH | 409 | 현재 타석과 다릅니다. |
| SESSION_FINISHED | 409 | 이미 종료된 경기입니다. |
| ANSWER_DEADLINE_EXCEEDED | 422 | 답안 제출 시간이 종료되었습니다. |
| RATE_LIMITED | 429 | 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. |
| GUEST_TRIAL_EXHAUSTED | 429 | 오늘 체험 가능한 이닝을 모두 사용했습니다. |
| INTERNAL_ERROR | 500 | 처리 중 오류가 발생했습니다. |

## 엔드포인트 목록

### 인증

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/v1/auth/callback` | Supabase 인증 콜백 | 불필요 |
| POST | `/api/v1/auth/signout` | 로그아웃 | 불필요 |
| GET | `/api/v1/auth` | 인증 페이지 | 불필요 |

### 사용자 정보

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/v1/me` | 사용자 프로필 조회 | 필요 |
| GET | `/api/v1/me/age` | 만 14세 확인 상태 | 필요 |
| POST | `/api/v1/me/age` | 만 14세 확인 | 필요 |
| GET | `/api/v1/me/batting` | 통산 타격 성적 | 필요 |
| GET | `/api/v1/me/export` | 개인정보 내보내기 | 필요 |

### 게임

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/v1/play/sessions` | 경기 시작 | 필요 |
| GET | `/api/v1/play/sessions/:id` | 경기 상태 복원 | 필요 |
| POST | `/api/v1/play/sessions/:id/at-bats` | 타석 제출 | 필요 |
| POST | `/api/v1/play/sessions/:id/abandon` | 중도 종료 | 필요 |
| GET | `/api/v1/play/sessions/:id/box-score` | 박스스코어 조회 | 필요 |

### 기타

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/v1/teams` | 팀 목록 | 불필요 |
| GET | `/api/v1/rankings/players` | 플레이어 랭킹 | 불필요 |

## 상세 스펙

### POST /api/v1/play/sessions

경기 시작.

**요청 본문:**
```json
{
  "mode": "trial" \| "official" \| "daily"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "sessionId": "string",
    "mode": "string",
    "official": true,
    "goal": { "kind": "innings" \| "pa", "target": number },
    "scoreboard": {
      "inning": 1,
      "outs": 0,
      "bases": 0,
      "runs": 0,
      "streak": 0
    },
    "atBat": { ... },
    "guestTrialRemaining": number | null
  }
}
```

레이트 리밋: 분당 6회 (`START_SESSION_RULE`)

### POST /api/v1/play/sessions/:id/at-bats

타석 제출. 마감 초과 시 트랜잭션은 커밋된 상태로 422 응답.

**요청 본문:**
```json
{
  "sequence": number,
  "optionId": "string" | undefined,
  "submissionId": "string"
}
```

**응답 (성공):**
```json
{
  "success": true,
  "data": {
    "outcome": "resolved" | "deadline_exceeded" | "replayed",
    "result": "K" | "BB" | "1B" | "2B" | "3B" | "HR",
    "upgraded": boolean,
    "upgradeReason": "hard" | "streak" | "both" | null,
    "isCorrect": boolean,
    "elapsedMs": number,
    "rbi": number,
    "inningEnded": boolean,
    "reveal": { ... },
    "scoreboard": { ... },
    "next": { ... } | null,
    "finished": boolean,
    "finish": { ... } | null
  }
}
```

레이트 리밋: 분당 120회 (`SUBMIT_AT_BAT_RULE`)

### GET /api/v1/play/sessions/:id

경기 상태 복원. 페이지 새로고침, 탭 복귀 시 사용.

**응답:**
```json
{
  "success": true,
  "data": {
    "sessionId": "string",
    "mode": "string",
    "official": true,
    "status": "active" | "finished" | "abandoned",
    "scoreboard": { ... },
    "atBat": { ... } | null,
    "atBatsPlayed": number
  }
}
```

## 게스트 체험 제한

- 게스트는 1일 2이닝 체험 가능
- 게스트 토큰 단위로 카운트 (쿠키 삭제 시 우회 가능, 보안 경계 아님)
- 공식 모드는 회원 전용
- 만 14세 미만은 회원 기록을 쌓지 않음

## 레이트 리밋

| 엔드포인트 | 버킷 | 제한 | 윈도 |
|------------|------|------|------|
| 경기 시작 | `play.start` | 6회 | 60초 |
| 타석 제출 | `play.submit` | 120회 | 60초 |
| 게스트 승계 | `auth.claim` | 10회 | 60초 |

## XP 지급 규칙

| 사유 | XP | 일일 상한 |
|------|-----|-----------|
| 정답 | 10 | 없음 |
| 고급 정답 보너스 | 5 | 없음 |
| 이닝 완료 | 20 | 5회 |
| 일일 완료 | 30 | 1회 |

멱등 키: `reason:entityId:userId`

## 보안 고려사항

- IP 원문은 DB에 저장되지 않음 (HMAC 해시만 저장)
- `X-Forwarded-For` 첫 주소는 사용하지 않음 (위조 가능)
- 정답은 `private` 스키마에만 저장, 공개 질의에서 제외
- 모든 쓰기 경로는 트랜잭션 필수
- 비밀값 로그 출력 금지
