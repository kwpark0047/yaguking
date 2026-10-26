/**
 * Firestore 오류 → 화면 문구. Firebase SDK를 불러오지 않는다(오류 코드 글자만 본다).
 *
 * 무료(Spark) 플랜은 하루 한도(읽기 5만·쓰기 2만)를 넘으면 그날은 `resource-exhausted`로
 * 거절한다. 한도는 **미국 태평양 시간 자정**에 다시 차므로 한국 시간으로는 오후 4시
 * (서머타임) 또는 5시다. 유료로 넘어가지 않는다 — 그날은 쉬어 간다.
 */
export const QUOTA_MESSAGE = '오늘 무료 사용량이 다 찼어요. 한국 시간 오후 4~5시쯤 다시 열려요.';

export function isQuotaExceeded(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'resource-exhausted' || code === 'firestore/resource-exhausted';
}

export function dataErrorMessage(error: unknown, fallback: string): string {
  if (isQuotaExceeded(error)) return QUOTA_MESSAGE;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'unavailable' || code === 'firestore/unavailable') return '연결이 끊겼어요. 인터넷을 확인하고 다시 해 주세요.';
  return fallback;
}
