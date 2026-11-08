import { KBO_QUIZ_START } from '@/lib/kbo/set';

/**
 * 가입 축하 포인트(docs/signup-boost.md S2) — 회원(닉네임까지 마친 사람)의 힌트 지갑 "모은 포인트"에 한 번 50P를 더한다.
 * 운영자 PC 지갑 작업(ops/monthly.mjs WELCOME_BONUS_*)이 더하고, 기기는 바꾸지 못한다. 등수 포인트에는 들어가지 않는다.
 * 처리방침 개정판(시행일 = 어제의 KBO 퀴즈 시작일)과 같은 날 시작한다(단위 테스트가 대조).
 */
export const WELCOME_BONUS_START = KBO_QUIZ_START;
export const WELCOME_BONUS_POINTS = 50;

export const welcomeBonusOpen = (today: string) => today >= WELCOME_BONUS_START;

/** 가입을 권할 만큼 잘한 경기인가 — 2안타 이상이거나 홈런 */
export const worthKeeping = (hits: number, homeRuns: number) => hits >= 2 || homeRuns >= 1;
