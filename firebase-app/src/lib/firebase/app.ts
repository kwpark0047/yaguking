import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { usingEmulators } from '@/lib/env';

/**
 * Firebase 앱 초기화. Auth와 Firestore는 **따로** 불러온다(auth.ts, db.ts) —
 * 첫 화면이 Firestore SDK까지 내려받지 않게 해서 Hosting 무료 전송량(하루 360 MB)을
 * 아낀다. Spark 플랜에서 쓰는 것은 Auth·Firestore·Hosting뿐이다.
 *
 * 에뮬레이터 모드(기본)는 실제 프로젝트 없이 `demo-` ID로 돈다.
 */
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
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: env.VITE_FIREBASE_PROJECT_ID,
          appId: env.VITE_FIREBASE_APP_ID,
        },
  );
}
