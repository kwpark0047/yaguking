/**
 * 관리자 판별 — 보안 규칙의 isAdmin()과 **같은 조건**(firestore.rules). 화면은 안내일 뿐이고 막는 것은 규칙이다.
 * 관리자 = 토큰 표시 admin + 이메일 인증 + 구글로 로그인한 세션.
 */
export interface TokenFacts {
  admin?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

export type AdminDenial = 'no-claim' | 'unverified' | 'not-google';

export function adminDenial(claims: TokenFacts): AdminDenial | null {
  if (claims.admin !== true) return 'no-claim';
  if (claims.email_verified !== true) return 'unverified';
  if (claims.firebase?.sign_in_provider !== 'google.com') return 'not-google';
  return null;
}

export const DENIAL_MESSAGE: Record<AdminDenial, string> = {
  'no-claim': '이 계정에는 관리자 표시가 없어요. 운영자 PC에서 관리자 표시를 붙인 뒤 "다시 확인"을 눌러 주세요.',
  unverified: '이메일 인증이 안 된 계정이에요. 인증된 구글 계정으로 로그인해 주세요.',
  'not-google': '관리자 화면은 구글로 로그인한 경우에만 열려요.',
};

/** 이메일 가리기: 앞 두 글자와 도메인만 — kw***@gmail.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(이메일 없음)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** 30분 동안 아무것도 안 하면 로그아웃(docs/admin-plan.md §2) */
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
