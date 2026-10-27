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

/** 관리자 사이트 주소(구글 로그인이 허용된 도메인) */
export const ADMIN_SITE_URL = 'https://yaguking-bc25c-admin.web.app';

const SIGN_IN_PROBLEM: Record<string, string> = {
  'auth/popup-blocked':
    '브라우저가 구글 로그인 창(팝업)을 막았어요. 주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트의 팝업을 "항상 허용"으로 바꾼 뒤, "구글로 로그인"을 다시 눌러 주세요.',
  'auth/popup-closed-by-user':
    '로그인을 마치기 전에 구글 로그인 창이 닫혔어요. "구글로 로그인"을 다시 누르고, 열린 창에서 계정을 고른 뒤 끝까지 진행해 주세요. 창이 안 보이면 다른 창 뒤에 있을 수 있어요.',
  'auth/unauthorized-domain': `이 주소에서는 구글 로그인이 허용되지 않아요. 관리자 사이트(${ADMIN_SITE_URL})에서 열어 주세요.`,
  'auth/network-request-failed': '인터넷 연결이 끊겨 로그인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.',
  'auth/operation-not-supported-in-this-environment':
    '이 브라우저에서는 구글 로그인 창을 열 수 없어요. 크롬이나 엣지에서 관리자 사이트를 열어 주세요.',
  'auth/web-storage-unsupported':
    '브라우저가 사이트 데이터 저장을 막아 로그인할 수 없어요. 시크릿 창이 아닌 일반 창에서, 사이트 데이터를 허용한 뒤 다시 시도해 주세요.',
};

/**
 * 구글 로그인(또는 다시 확인) 실패를 이유와 할 일로 알린다. 다른 로그인 창을 여느라 앞 요청이 취소된 경우
 * (`auth/cancelled-popup-request`)만 알리지 않는다 — 새 창이 이미 떠 있다.
 */
export function signInProblem(code: string | undefined): string | null {
  if (code === 'auth/cancelled-popup-request') return null;
  if (code && SIGN_IN_PROBLEM[code]) return SIGN_IN_PROBLEM[code];
  return `로그인하지 못했어요${code ? `(${code})` : ''}. 잠시 뒤 다시 시도해 주세요.`;
}

/** 이메일 가리기: 앞 두 글자와 도메인만 — kw***@gmail.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(이메일 없음)';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** 30분 동안 아무것도 안 하면 로그아웃(docs/admin-plan.md §2) */
export const ADMIN_IDLE_MS = 30 * 60 * 1000;
