import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { usingEmulators } from '@/lib/env';

/**
 * Firebase 앱 초기화. Auth와 Firestore는 **따로** 불러온다(auth.ts, db.ts) —
 * 첫 화면이 Firestore SDK까지 내려받지 않게 해서 Hosting 무료 전송량(하루 360 MB)을
 * 아낀다. Spark 플랜에서 쓰는 것은 Auth·Firestore·Hosting뿐이다.
 *
 * 에뮬레이터 모드(기본)는 실제 프로젝트 없이 `demo-` ID로 돈다.
 */

/**
 * 로그인 처리 주소(authDomain)를 **앱과 같은 주소**로 쓰는 Hosting 사이트. Firebase Hosting은 모든 사이트에서 `/__/auth/handler`를
 * 제공한다. 앱(yaguking.web.app)과 로그인 처리(yaguking-bc25c.firebaseapp.com)의 주소가 다르면, 저장소를 사이트마다 나누는 브라우저
 * (사파리·최신 크롬·홈 화면 앱)에서 구글 로그인이 "missing initial state" 오류로 끝난다. 같은 주소면 이 문제가 없다.
 * 이 주소의 `/__/auth/handler`가 구글 OAuth 클라이언트의 승인된 리디렉션 URI에 있어야 한다(docs/deploy.md §11).
 * 미리보기 채널·관리자 사이트는 목록에 없으므로 설정값(VITE_FIREBASE_AUTH_DOMAIN)을 그대로 쓴다.
 */
export const SAME_ORIGIN_AUTH_HOSTS: readonly string[] = ['yaguking.web.app'];

export function authDomainFor(hostname: string, configured: string | undefined): string | undefined {
  return SAME_ORIGIN_AUTH_HOSTS.includes(hostname) ? hostname : configured;
}

export function firebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const env = import.meta.env;
  if (!usingEmulators && !env.VITE_FIREBASE_PROJECT_ID) {
    throw new Error('Firebase 설정이 없습니다. .env.local에 VITE_FIREBASE_* 값을 넣어 주세요.');
  }
  return initializeApp(
    usingEmulators
      ? {
          apiKey: 'demo-key',
          authDomain: 'demo-yaguking.firebaseapp.com',
          projectId: 'demo-yaguking',
          appId: 'demo-app',
        }
      : {
          apiKey: env.VITE_FIREBASE_API_KEY,
          authDomain: authDomainFor(typeof location === 'undefined' ? '' : location.hostname, env.VITE_FIREBASE_AUTH_DOMAIN),
          projectId: env.VITE_FIREBASE_PROJECT_ID,
          appId: env.VITE_FIREBASE_APP_ID,
        },
  );
}
