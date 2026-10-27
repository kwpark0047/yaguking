/**
 * 가입 확인(점검 목록, docs/admin-plan.md §5.2) — 가입이 제대로 끝났는지. 관리자가 승인하는 방식이 아니다.
 * 계정 사본(accountMirror, 운영자 PC가 동기화)과 프로필(users/{uid})을 함께 본다.
 */
export interface MirrorFacts {
  emailVerified: boolean;
  providers: string[];
}

export interface ProfileFacts {
  ageConfirmed: boolean;
  nickname: string | null;
  favoriteTeams: string[];
}

export type SignupStatus = 'complete' | 'needs-age' | 'needs-profile';

export interface SignupCheck {
  status: SignupStatus;
  /** 이메일·비밀번호로 가입했는데 이메일 인증을 안 함(구글은 구글이 인증) */
  emailUnverified: boolean;
}

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  complete: '가입 완료',
  'needs-age': '만 14세 확인 안 함',
  'needs-profile': '프로필 미완료',
};

export function signupCheck(mirror: MirrorFacts, profile: ProfileFacts | null): SignupCheck {
  const emailUnverified = mirror.providers.includes('password') && !mirror.emailVerified;
  if (!profile || !profile.ageConfirmed) return { status: 'needs-age', emailUnverified };
  if (!profile.nickname || profile.favoriteTeams.length === 0) return { status: 'needs-profile', emailUnverified };
  return { status: 'complete', emailUnverified };
}

export function summarize(checks: readonly SignupCheck[]) {
  return {
    total: checks.length,
    complete: checks.filter((check) => check.status === 'complete').length,
    needsAge: checks.filter((check) => check.status === 'needs-age').length,
    needsProfile: checks.filter((check) => check.status === 'needs-profile').length,
    emailUnverified: checks.filter((check) => check.emailUnverified).length,
  };
}
