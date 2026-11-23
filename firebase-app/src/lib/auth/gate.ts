/**
 * 회원이 지금 어디로 가야 하는가 — 만 14세 확인, 그다음 프로필 설정(3단계).
 *
 * - 비회원(익명 로그인)은 묻지 않는다 — 회원 기록이 아니다
 * - 프로필을 아직 못 읽었으면(불러오는 중·연결 오류) 판단을 미룬다. 엉뚱한 화면으로
 *   보내지 않는다
 *
 * 화면은 이 판단으로 안내만 한다. **실제로 막는 것은 Firestore 보안 규칙이다.**
 */

/** users/{uid}에서 화면이 쓰는 부분 */
export interface ProfileData {
  nickname: string | null;
  favoriteTeams: string[];
  favoritePlayers: string[];
  levelTestDone: boolean;
  /** 월간 등수에서 닉네임 숨기기(docs/engagement-plan.md §4) */
  rankingHidden: boolean;
  /** 만 14세 미만 자녀 계정 — none(아님)·pending(보호자 동의 기다림)·consented(동의 받음). src/lib/auth/guardian.ts */
  guardian: GuardianState;
  /** 내 팀 코드(합류했거나 신청 중 — 어느 쪽인지는 팀 문서로 안다). src/lib/squad/squad.ts */
  squad: string | null;
  /** 팀에서 나온 시각(ms) — 나간 뒤 7일 동안 다른 팀에 신청할 수 없다 */
  squadLeftAt: number | null;
}

export type GuardianState = 'none' | 'pending' | 'consented';

/** ageConfirmed: 만 14세 이상 확인 또는 보호자 동의를 받은 자녀 — 회원 기록을 남길 수 있다(규칙 ageConfirmed()와 같다) */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; ageConfirmed: boolean; data: ProfileData };

type Who = { isAnonymous: boolean } | null;

/** 보호자 동의를 기다리는 자녀 계정 — 나이 확인 대신 동의 안내 화면으로 */
export function waitsForGuardian(user: Who, profile: ProfileState): boolean {
  return !!user && !user.isAnonymous && profile.status === 'ready' && profile.data.guardian === 'pending';
}

export function needsAgeCheck(user: Who, profile: ProfileState): boolean {
  if (!user || user.isAnonymous) return false;
  if (profile.status === 'missing') return true;
  if (profile.status === 'ready') return !profile.ageConfirmed && profile.data.guardian !== 'pending';
  return false;
}

/** 닉네임과 최애 구단 1위가 있어야 시작한다(가입 흐름: 닉네임 → 구단 TOP3 → 선수). */
export function needsProfileSetup(user: Who, profile: ProfileState): boolean {
  if (!user || user.isAnonymous) return false;
  if (profile.status !== 'ready' || !profile.ageConfirmed) return false;
  return !profile.data.nickname || profile.data.favoriteTeams.length === 0;
}
