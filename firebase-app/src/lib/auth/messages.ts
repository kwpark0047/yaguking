/**
 * Firebase Auth 오류 코드를 사람이 읽을 문장으로 바꾼다.
 *
 * 로그인 실패 원인을 너무 자세히 밝히지 않는다 — "그런 이메일은 없다"와
 * "비밀번호가 틀렸다"를 구분해 알려 주면 가입 여부를 캐낼 수 있다.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/invalid-email': '이메일 형식을 확인해 주세요.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/weak-password': '비밀번호는 8자 이상으로 정해 주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/credential-already-in-use': '이미 다른 계정에 연결된 로그인 방법이에요. 그 계정으로 로그인해 주세요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.',
  'auth/network-request-failed': '네트워크에 연결할 수 없어요. 연결을 확인해 주세요.',
  'auth/popup-closed-by-user': '로그인 창이 닫혔어요. 다시 시도해 주세요.',
  'auth/cancelled-popup-request': '로그인 창이 닫혔어요. 다시 시도해 주세요.',
  'auth/popup-blocked': '브라우저가 로그인 창을 막았어요. 팝업을 허용해 주세요.',
  'auth/requires-recent-login': '보안을 위해 다시 로그인한 뒤 시도해 주세요.',
  'auth/operation-not-allowed': '이 로그인 방법은 아직 켜져 있지 않아요.',
  'auth/quota-exceeded': '오늘 처리할 수 있는 양을 넘었어요. 내일 다시 시도해 주세요.',
};

export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return MESSAGES[code] ?? '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
}

/** 가입 비밀번호 규칙. Firebase 기본(6자)보다 길게 받는다. */
export const PASSWORD_MIN_LENGTH = 8;

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (password !== confirm) return '비밀번호 확인이 일치하지 않아요.';
  return null;
}
