import { ADMIN_PRIVACY_EFFECTIVE, kstDateKey } from '@/content/privacy';
import { usingEmulators } from '@/lib/env';

/**
 * 회원 정보 열람 시작일 지키기 — 처리방침 개정(운영자 열람·접속기록)이 시행되기 전에는 관리 화면에서 회원 정보를 보지 않는다.
 * 운영 빌드에서만 막는다(에뮬레이터·테스트는 날짜와 상관없이 기능을 검증한다). 운영자 PC 동기화도 같은 날짜를 지킨다(ops/admin.mjs).
 */
export function memberDataOpen(today: string = kstDateKey(), enforce: boolean = !usingEmulators): boolean {
  return !enforce || today >= ADMIN_PRIVACY_EFFECTIVE;
}

export const MEMBER_DATA_CLOSED_MESSAGE = `회원 정보 열람은 개인정보처리방침 개정 시행일(${ADMIN_PRIVACY_EFFECTIVE})부터 쓸 수 있어요. 그 전에는 공지·대시보드 숫자만 씁니다.`;
