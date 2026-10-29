/**
 * 로그인 처리 주소(authDomain)를 **앱과 같은 주소**로 쓰는 Hosting 사이트. Firebase Hosting은 모든 사이트에서 `/__/auth/handler`를
 * 제공한다. 앱(yaguking.web.app)과 로그인 처리(yaguking-bc25c.firebaseapp.com)의 주소가 다르면, 저장소를 사이트마다 나누는 브라우저
 * (사파리·최신 크롬·홈 화면 앱)에서 구글 로그인이 "missing initial state" 오류로 끝난다. 같은 주소면 이 문제가 없다.
 * 이 주소의 `/__/auth/handler`가 구글 OAuth 클라이언트의 승인된 리디렉션 URI에 있어야 한다(docs/deploy.md §11).
 * 미리보기 채널·관리자 사이트는 목록에 없으므로 설정값(VITE_FIREBASE_AUTH_DOMAIN)을 그대로 쓴다.
 */
export const SAME_ORIGIN_AUTH_HOSTS: readonly string[] = ['yaguking.web.app'];

/**
 * 같은 주소 로그인을 켤까 — **꺼 둠(2026-10-29)**: 구글 OAuth 클라이언트에 `https://yaguking.web.app/__/auth/handler`가 아직 등록되지 않아
 * 켜면 구글이 로그인을 막는다(redirect_uri_mismatch). 등록 뒤 `node scripts/check-oauth-redirect.mjs`가 통과하면 true로 바꿔 배포한다.
 * 꺼져 있으면 예전처럼: 설정값 authDomain, 홈 화면 앱도 팝업 로그인.
 */
export const SAME_ORIGIN_AUTH_ENABLED = false;

export function authDomainFor(hostname: string, configured: string | undefined, enabled: boolean = SAME_ORIGIN_AUTH_ENABLED): string | undefined {
  return enabled && SAME_ORIGIN_AUTH_HOSTS.includes(hostname) ? hostname : configured;
}
