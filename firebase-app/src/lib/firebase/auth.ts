import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { usingEmulators } from '@/lib/env';
import { firebaseApp } from './app';

let auth: Auth | null = null;

/** Firebase Auth. 에뮬레이터 모드면 로컬(9099)에 붙는다. */
export function firebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(firebaseApp());
    if (usingEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}
