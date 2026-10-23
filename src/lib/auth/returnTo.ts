/**
 * 로그인 복귀 경로.
 *
 * OAuth 왕복 중에도 원래 있던 화면(결과 화면·초대 링크)으로 돌아와야 한다
 * (08 문서 §4 UX 예외 흐름).
 *
 * 외부 도메인으로 보내는 오픈 리다이렉트를 막기 위해 **같은 사이트 내부 경로만**
 * 허용한다.
 */
export const DEFAULT_RETURN_TO = '/';

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_RETURN_TO;
  if (!value.startsWith('/')) return DEFAULT_RETURN_TO;
  // `//evil.com` 과 `/\evil.com` 은 프로토콜 상대 URL로 해석될 수 있다.
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_RETURN_TO;
  return value;
}

/** 복귀 경로에 플래그를 덧붙인다. 이미 쿼리가 있으면 &로 잇는다. */
export function withFlag(path: string, key: string, value: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}
