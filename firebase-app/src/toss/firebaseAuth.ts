import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { firebaseApp } from '@/lib/firebase/app';
import { usingEmulators } from '@/lib/env';

let auth: Auth | null = null;

/**
 * 미니앱판 Firebase Auth — 익명 계정만 쓴다. getAuth()는 휴대폰에서 구글 로그인용 숨은 iframe을 미리 띄우는데
 * 앱인토스는 iframe을 금지한다. 그래서 팝업·이동 로그인 처리기(popupRedirectResolver) 없이 초기화한다.
 */
export function firebaseAuth(): Auth {
  if (!auth) {
    auth = initializeAuth(firebaseApp(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    if (usingEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return auth;
}
