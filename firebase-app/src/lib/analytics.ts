/**
 * 마케팅 진단을 위한 이벤트 추적(docs/analytics-plan.md).
 *
 * Firestore에 이벤트를 기록한다. 보안 규칙(`analytics` 컬렉션)은
 * 인증된 사용자(비회원 익명 포함)가 자신의 이벤트만 쓰게 하고,
 * 관리자만 전체 목록을 읽게 한다.
 *
 * 기록 항목:
 *   - page_view: 페이지 조회 (경로, UTM, 참조자)
 *   - signup_start: 회원 가입 시작 (이메일/소셜)
 *   - signup_complete: 회원 가입 완료
 *   - age_confirmed: 만 14세 확인 완료
 *   - profile_complete: 프로필 작성 완료
 *   - level_test_complete: 레벨 테스트 완료
 *   - game_start: 경기 시작 (연습/레벨 테스트/대결)
 *   - game_complete: 경기 완료 (득점, 타수, 정답 수)
 *   - first_game: 첫 경기 (가입 후 최초)
 *   - level_up: 등급 상승
 *
 * 비용 주의: 무료 플랜 하루 쓰기 5만 건. 이벤트는 경기 완료 등
 * 중요한 시점에만 기록한다(모든 타석은 기록하지 않음).
 */

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';

/** 기록할 이벤트 이름 */
export type AnalyticsEventName =
  | 'page_view'
  | 'signup_start'
  | 'signup_complete'
  | 'age_confirmed'
  | 'profile_complete'
  | 'level_test_complete'
  | 'game_start'
  | 'game_complete'
  | 'first_game'
  | 'level_up';

/** 이벤트 공통 필드 */
export interface AnalyticsEventCommon {
  /** 사용자 ID(비회원 익명 UID 포함) */
  uid: string;
  /** 회원 여부 */
  isMember: boolean;
  /** 세션 ID(브라우저 재방문 시 변경) */
  sessionId: string;
  /** 이벤트 발생 시각(클라이언트 ms) */
  at: number;
  /** 페이지 경로 */
  path: string;
  /** UTM 파라미터 */
  utm?: UtmParams;
}

/** 이벤트별 추가 필드 */
export interface AnalyticsEventPayload {
  page_view?: { referrer?: string };
  signup_start?: { method: 'email' | 'google' | 'kakao' };
  signup_complete?: { method: 'email' | 'google' | 'kakao'; ageConfirmed: boolean };
  age_confirmed?: {};
  profile_complete?: { nickname: boolean; favoriteTeams: number };
  level_test_complete?: { correct: number; total: number; tier: number };
  game_start?: { mode: 'practice' | 'levelTest' | 'room' };
  game_complete?: { mode: string; runs: number; pa: number; correct: number; homeRuns: number };
  first_game?: { mode: string };
  level_up?: { fromTier: number; toTier: number };
}

/** UTM 파라미터 */
export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

/** 브라우저 세션 ID(로컬 스토리지에 지속) */
const SESSION_KEY = 'yk_session_id';
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** 현재 URL에서 UTM 파라미터 추출 */
export function captureUtm(): UtmParams | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const value = params.get(key);
    if (value) utm[key.replace('utm_', '') as keyof UtmParams] = value;
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

/** UTM 파라미터를 세션 스토리지에 저장(페이지 이동 후에도 유지) */
export function persistUtm(): void {
  if (typeof window === 'undefined') return;
  const utm = captureUtm();
  if (utm) {
    sessionStorage.setItem('yk_utm', JSON.stringify(utm));
  }
}

/** 저장된 UTM 파라미터 읽기 */
export function readStoredUtm(): UtmParams | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = sessionStorage.getItem('yk_utm');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as UtmParams;
  } catch {
    return undefined;
  }
}

/** 이벤트 하나를 Firestore에 기록 */
export async function trackEvent(
  name: AnalyticsEventName,
  payload: {
    uid: string;
    isMember: boolean;
    path?: string;
    data?: AnalyticsEventPayload[AnalyticsEventName];
  },
): Promise<void> {
  const db = firestore();
  const eventId = `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const utm = readStoredUtm();

  const event: DocumentData = {
    name,
    uid: payload.uid,
    isMember: payload.isMember,
    sessionId: getSessionId(),
    at: serverTimestamp(),
    path: payload.path ?? (typeof location !== 'undefined' ? location.pathname : ''),
    utm: utm ?? null,
    ...(payload.data ? { data: payload.data } : {}),
  };

  await setDoc(doc(collection(db, 'analytics', 'events'), eventId), event);
}

/** 편의 래퍼: 자주 쓰는 이벤트들 */
export const analytics = {
  pageView: (uid: string, isMember: boolean, referrer?: string) =>
    trackEvent('page_view', { uid, isMember, data: { page_view: { referrer } } }),

  signupStart: (uid: string, isMember: boolean, method: 'email' | 'google' | 'kakao') =>
    trackEvent('signup_start', { uid, isMember, data: { signup_start: { method } } }),

  signupComplete: (
    uid: string,
    isMember: boolean,
    method: 'email' | 'google' | 'kakao',
    ageConfirmed: boolean,
  ) =>
    trackEvent('signup_complete', {
      uid,
      isMember,
      data: { signup_complete: { method, ageConfirmed } },
    }),

  ageConfirmed: (uid: string, isMember: boolean) =>
    trackEvent('age_confirmed', { uid, isMember }),

  profileComplete: (uid: string, isMember: boolean, nickname: boolean, favoriteTeams: number) =>
    trackEvent('profile_complete', {
      uid,
      isMember,
      data: { profile_complete: { nickname, favoriteTeams } },
    }),

  levelTestComplete: (uid: string, isMember: boolean, correct: number, total: number, tier: number) =>
    trackEvent('level_test_complete', {
      uid,
      isMember,
      data: { level_test_complete: { correct, total, tier } },
    }),

  gameStart: (uid: string, isMember: boolean, mode: 'practice' | 'levelTest' | 'room') =>
    trackEvent('game_start', { uid, isMember, data: { game_start: { mode } } }),

  gameComplete: (
    uid: string,
    isMember: boolean,
    mode: string,
    runs: number,
    pa: number,
    correct: number,
    homeRuns: number,
  ) =>
    trackEvent('game_complete', {
      uid,
      isMember,
      data: { game_complete: { mode, runs, pa, correct, homeRuns } },
    }),

  firstGame: (uid: string, isMember: boolean, mode: string) =>
    trackEvent('first_game', { uid, isMember, data: { first_game: { mode } } }),

  levelUp: (uid: string, isMember: boolean, fromTier: number, toTier: number) =>
    trackEvent('level_up', { uid, isMember, data: { level_up: { fromTier, toTier } } }),
};
