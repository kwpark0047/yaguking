import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { usingEmulators } from '@/lib/env';

/**
 * Firebase 초기화 — Spark(무료) 플랜에서 쓰는 것은 Auth·Firestore·Hosting뿐이다.
 * Cloud Functions·Storage·결제가 필요한 기능은 쓰지 않는다(16 문서 예정).
 *
 * `VITE_USE_EMULATORS`가 켜져 있으면(기본) 실제 프로젝트 없이 로컬 에뮬레이터에
 * 붙는다. 프로젝트 ID `demo-`로 시작하는 이름은 에뮬레이터 전용이라 실수로 운영에
 * 쓰이지 않는다.
 *
 * 무료 할당량(읽기 하루 5만)을 아끼려고 Firestore를 **기기 캐시**와 함께 연다 —
 * 한 번 받은 문서는 다시 읽어도 서버 읽기로 세지 않는다.
 */

const env = import.meta.env;

const config = usingEmulators
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
    };

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/** 처음 부를 때 한 번만 초기화한다. 테스트·서버 렌더링 없이 브라우저에서만 쓴다. */
export function firebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app || !auth || !db) {
    if (!usingEmulators && !config.projectId) {
      throw new Error('Firebase 설정이 없습니다. .env.local에 VITE_FIREBASE_* 값을 넣어 주세요.');
    }
    app = initializeApp(config);
    auth = getAuth(app);
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (usingEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
  }
  return { app, auth, db };
}
