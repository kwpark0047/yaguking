/**
 * 개인정보 보관 기간 — 처리방침(/privacy)에 적힌 숫자의 **단일 출처**다.
 *
 * 실제 파기는 DB 함수 `public.purge_expired_personal_data()`(0016)가 한다.
 * 그 함수의 기본 인자가 이 값과 같아야 하며, 통합 테스트가 대조한다
 * (tests/integration/privacyPurge.test.ts). 하나만 바꾸면 처리방침이 거짓이 된다.
 *
 * 근거는 15 문서 §2.
 */

/** 비회원 체험 기록 — 마지막 이용 후. 게스트 쿠키 수명(30일)과 같다 */
export const GUEST_RETENTION_DAYS = 30;

/** 로그인 기록(인증 감사 로그: 접속 주소·시각)과 쓰지 않는 로그인 세션 */
export const AUTH_LOG_RETENTION_DAYS = 90;

/** 레이트 리밋 카운터(접속 주소를 HMAC으로 바꾼 값) */
export const RATE_LIMIT_RETENTION_HOURS = 1;

/** 게스트 쿠키 `yk_guest`의 수명(일). src/lib/guest/token.ts와 같아야 한다 */
export const GUEST_COOKIE_DAYS = 30;

/** 화면 스타일 쿠키 `yk_style`의 수명(일). src/lib/theme/style.ts와 같아야 한다 */
export const STYLE_COOKIE_DAYS = 365;
