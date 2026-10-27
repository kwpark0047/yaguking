/**
 * 비회원 하루 경기 수(한국 시간 기준). 화면 문구·처리방침이 이 값을 쓴다.
 * 실제로 막는 것은 보안 규칙(firestore.rules `daily` 카운터 상한) — 규칙은 코드를 불러올 수 없어
 * 같은 숫자를 따로 적고, 단위 테스트(tests/unit/guestLimit.test.ts)가 둘이 같은지 지킨다.
 * Firebase를 불러오지 않는다(처리방침 화면이 쓴다).
 */
export const GUEST_DAILY_GAMES = 3;
