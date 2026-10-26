/**
 * 만 14세 확인이 필요한가 (15 문서 §3, Firebase판).
 *
 * - 비회원(익명 로그인)은 묻지 않는다 — 회원 기록이 아니다
 * - 회원은 `users/{uid}.ageConfirmedAt`이 생길 때까지 확인 화면에 머문다
 * - 프로필을 아직 못 읽었으면(불러오는 중·연결 오류) 판단을 미룬다. 확인 화면으로
 *   잘못 보내지 않는다
 *
 * 화면은 이 판단으로 안내만 한다. **실제로 막는 것은 Firestore 보안 규칙이다**
 * (`firestore.rules`의 `ageConfirmed()`).
 */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; ageConfirmed: boolean };

export function needsAgeCheck(
  user: { isAnonymous: boolean } | null,
  profile: ProfileState,
): boolean {
  if (!user || user.isAnonymous) return false;
  if (profile.status === 'missing') return true;
  if (profile.status === 'ready') return !profile.ageConfirmed;
  return false;
}
