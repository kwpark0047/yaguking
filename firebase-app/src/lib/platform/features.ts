/** 판마다 다른 기능 — 웹판은 이 파일, 앱인토스 미니앱판은 src/toss/features.ts(vite.toss.config.ts가 바꿔 끼운다) */

/** 가입·로그인이 있는 판인가. 미니앱판은 토스 로그인만 허용되는데 서버 없이는 쓸 수 없어 비회원 전용이다 */
export const HAS_ACCOUNTS: boolean = true;
