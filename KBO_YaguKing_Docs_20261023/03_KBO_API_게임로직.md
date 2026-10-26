# 야구왕 — API 계약 및 게임 로직 명세

> **Firebase 무료판 안내(2026-10-26)** — 이 문서의 플랫폼 부분(Supabase·Vercel·서버 판정 등)은 16 문서(무료 플랜 Firebase 전환) §4의 "03" 줄로 바뀌었다. 본문은 그대로 둔다.

- 기준: PRD v1.0 / API prefix `/api/v1`
- 인증: Supabase Auth JWT. 서버에서 토큰 검증 및 사용자 ID 추출. 클라이언트 제공 점수/정오/응답시간/관리자 역할은 신뢰하지 않음.
- 응답 규격: `{ "success": true, "data": ... }` 또는 `{ "success": false, "error": { "code": "...", "message": "...", "requestId": "..." } }`

## 1. REST 엔드포인트

| Method | Path | 권한 | 핵심 기능 |
|---|---|---|---|
| GET | `/me` | 회원 | 본인 프로필·온보딩 상태 |
| PATCH | `/me` | 회원 | 닉네임·공개 프로필 수정 |
| PUT | `/me/favorites/teams` | 회원 | 구단 순위 1~3 일괄 교체 |
| PUT | `/me/favorites/players` | 회원 | 선수 순위 1~3 일괄 교체 |
| GET | `/teams` | 공개 | 구단 검색·목록 |
| GET | `/players?search=` | 공개 | 선수 자동완성 |
| POST | `/placement/start` | 회원 | 최초 테스트 시작·기존 진행 세션 반환 |
| GET | `/placement/current` | 회원 | 진행 중 세션 복원 |
| POST | `/placement/{id}/answers` | 회원 | 한 문제 답안 제출 |
| GET | `/placement/{id}/result` | 본인 | 완료된 테스트 결과 |
| POST | `/quiz/sessions` | 회원/체험 | 개인 퀴즈 시작 |
| GET | `/quiz/sessions/{id}` | 세션 소유자 | 현재 문제·마감 조회 |
| POST | `/quiz/sessions/{id}/answers` | 세션 소유자 | 정답 제출 |
| GET | `/quiz/sessions/{id}/result` | 세션 소유자 | 결과·해설 |
| GET | `/me/wrong-answers` | 회원 | 오답 목록/필터/페이지 |
| POST | `/reviews/sessions` | 회원 | 복습 세션 생성 |
| POST | `/reviews/{id}/answers` | 회원 | 복습 제출·간격 갱신 |
| GET | `/me/statistics` | 회원 | 개인 점수·정답률·추이 |
| POST | `/rooms` | 회원 | 방 생성 |
| POST | `/rooms/join` | 회원 | 코드 입장 |
| GET | `/rooms/{id}` | 참가자 | 대기실·참가자 |
| PATCH | `/rooms/{id}/ready` | 참가자 | 준비 토글 |
| POST | `/rooms/{id}/start` | 방장 | 게임 시작 |
| GET | `/matches/{id}/state` | 참가자 | 서버 상태 스냅샷 |
| POST | `/matches/{id}/answers` | 참가자 | 실시간 답안 제출 |
| GET | `/matches/{id}/result` | 참가자 | 최종 결과 |
| GET | `/rankings/players` | 공개 | 기간별 개인 랭킹 |
| GET | `/rankings/teams` | 공개 | 구단 팬 랭킹 |

## 2. API 요청 예시

방 생성:
```json
{"name":"잠실 야구왕 대결","mode":"friendly","questionCount":10,"timeLimitSeconds":15,"difficulty":"mixed","visibility":"private","maxPlayers":10}
```
방 생성 응답:
```json
{"success":true,"data":{"roomId":"550e8400-e29b-41d4-a716-446655440000","code":"KBO8X2","status":"waiting","maxPlayers":10}}
```
답안 제출:
```json
{"questionId":"550e8400-e29b-41d4-a716-446655440001","optionId":"550e8400-e29b-41d4-a716-446655440002","submissionId":"550e8400-e29b-41d4-a716-446655440003"}
```
오류:
```json
{"success":false,"error":{"code":"ANSWER_DEADLINE_EXCEEDED","message":"답안 제출 시간이 종료되었습니다.","requestId":"req_example"}}
```

## 3. 정답·점수 계산

15초 제한, 서버가 `opened_at`과 `received_at`으로 `t_ms` 측정. 네트워크 지연 정책은 **서버 수신 시각 기준**으로 MVP 고정; RTT 보정은 부정행위·공정성 테스트 후 검토.

```ts
function scoreAnswer(correct: boolean, elapsedMs: number, streakAfter: number) {
  if (!correct || elapsedMs > 15000) return 0;
  const t = Math.max(0, Math.min(15000, elapsedMs));
  const speedBonus = Math.floor(50 * (15000 - t) / 15000);
  const streakBonus = streakAfter === 3 ? 30 :
    (streakAfter >= 5 && streakAfter % 5 === 0 ? 70 : 0);
  return 100 + speedBonus + streakBonus;
}
```

검증값: 정답 0초·일반=150점, 5초·3연속=163점, 15초·일반=100점, 오답=0점. 정답 제출은 최초 1회만 허용, 이후 재제출은 동일 결과 반환 또는 `ALREADY_SUBMITTED`.

## 4. 최초 테스트와 레벨

20문제, 5영역×4, 초급8/중급8/고급4. 정답 수만 평가. 0~5 Lv1, 6~9 Lv2, 10~13 Lv3, 14~17 Lv4, 18~20 Lv5. 최초 배정 XP: Lv1 0, Lv2 500, Lv3 1500, Lv4 3500, Lv5 7000. `placement_grant` 원장 거래로 지급; 1회만.

레벨 XP 임계값: `[0,500,1500,3500,7000,12000,20000]`. MVP XP 자동 승급은 Lv3까지. Lv4~7 일반 승급은 2차 시험 기능 공개 후 활성화. 이미 최초 배정된 Lv4/5는 유지.

## 5. XP 지급 이벤트

| event | XP | 제한/멱등성 |
|---|---:|---|
| `answer_correct` | +10 | 공식 최초 풀이 |
| `hard_correct_bonus` | +5 | 고급 문제 최초 정답 |
| `solo_complete` | +20 | 일 5회 |
| `daily_complete` | +30 | 일 1회 |
| `friendly_complete` | +20 | 일 5회 |
| `friendly_win` | +30 | 일 5회 |
| `review_five_complete` | +20 | 일 2회 |
| `streak_7d` | +100 | 7일 주기 1회 |

지급은 DB 트랜잭션 내 `xp_transactions` INSERT + 합계 갱신. `idempotency_key = eventType:entityId:userId` 같은 결정적 식별자 사용. 정정·취소는 삭제가 아닌 반대 거래로 감사 이력 유지.

## 6. 경기 상태 머신

`WAITING -> COUNTDOWN -> QUESTION_ACTIVE -> REVEAL -> QUESTION_ACTIVE ... -> FINISHED`.

- WAITING: 방장 생성, 2~10명 참가, 준비 확인.
- COUNTDOWN: 서버 시작 시각 확정.
- QUESTION_ACTIVE: 모든 참가자에게 동일 문항·보기 순서·마감 시각 제공. 정답은 비공개.
- REVEAL: 모든 참가자 제출 또는 마감 시 서버가 정답·점수·순위 공개.
- FINISHED: 결과·XP를 원자적으로 확정하고 읽기 전용 처리.
- DISCONNECT: 상태는 유지; 참가자 재접속 시 `GET /matches/{id}/state`로 복원. 중도 이탈은 제한시간 경과 시 무응답 처리.
- HOST TRANSFER: 방장 이탈 시 입장 시각이 가장 빠른 연결된 참가자에게 서버에서 이양.

이벤트: `room.player_joined`, `room.player_left`, `room.ready_changed`, `match.started`, `question.started`, `answer.accepted`, `question.revealed`, `leaderboard.updated`, `match.finished`.

## 7. 공식 랭킹

MVP: 공식 게임 누적 점수/최고점/승률, 기간별(일·주·시즌·전체) 랭킹. 동점 시 정답률 높은 순 → 평균 응답시간 짧은 순 → 먼저 달성한 순. 구단 팬 랭킹은 이벤트 시작 대표 구단 스냅샷, 최소 참가자 조건, 평균 유효 점수로 비교.

2차 공식 1:1 랭크전 RP: `E=1/(1+10^((R_opponent-R_self)/400))`, `R_new=round(R+K*(S-E))`, 초기 1000, 첫 20전 K32 이후 K16. 친선방은 RP 미지급.

## 8. 오류 코드 및 상태

`VALIDATION_ERROR`(400), `UNAUTHORIZED`(401), `FORBIDDEN`(403), `NOT_FOUND`(404), `ALREADY_SUBMITTED`(409), `ROOM_FULL`(409), `ROOM_EXPIRED`(410), `ANSWER_DEADLINE_EXCEEDED`(422), `RATE_LIMITED`(429), `INTERNAL_ERROR`(500).

## 9. 보안·테스트

- 서버가 토큰 검증, 권한, 현재 문항, 마감시간, 최초 제출, 선택지 소속, 점수를 확인.
- 정답 공개 전 정답/해설/`is_correct` 전송 금지.
- API rate limiting, 방 생성 상한, 감사 로그, 익명 초대 토큰 만료.
- 테스트: 2~10명 동시 답안, 중복·지연·재접속·방장 이탈, XP 중복 지급, 시즌 순위 일관성.
- API 변경 시 OpenAPI 3.1 스키마 생성·타입 동기화 및 계약 테스트 수행.
