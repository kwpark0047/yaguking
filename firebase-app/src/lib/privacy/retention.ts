/**
 * 보관 기간 — 처리방침(/privacy)에 적힌 숫자의 **단일 출처**(Firebase판).
 *
 * 실제로 지우는 것은 정리 작업 `ops/cleanup.mjs`다. 그쪽 상수와 이 값이 같아야 하며 단위 테스트가
 * 대조한다(tests/unit/privacy.test.ts). 하나만 바꾸면 처리방침이 거짓이 된다.
 * 기준은 기존 앱의 처리방침(15 문서 §2) — 비회원 체험 기록은 마지막 이용 후 30일.
 */

/** 비회원(익명 계정)과 그 기록 — 마지막 이용 후 */
export const GUEST_RETENTION_DAYS = 30;

/** 친구 대결 방과 참가 기록 — 방을 만든 뒤 */
export const ROOM_RETENTION_HOURS = 24;

/** 월간 등수 문서(닉네임·최애 구단·포인트) — 그 달이 끝나고 이만큼 지나면 지운다(ops/monthly.mjs) */
export const LEADERBOARD_MONTHS_KEPT = 12;

/** 오늘의 공식전 문제·답(선택·답한 시각)과 정답 — 공식전 날부터 이만큼 지나면 지운다(ops/official.mjs) */
export const OFFICIAL_RETENTION_DAYS = 40;

/** 기기에 기억하는 "최근 본 문항" 수(src/lib/game/persist.ts) */
export const SEEN_QUESTIONS_KEPT = 150;
