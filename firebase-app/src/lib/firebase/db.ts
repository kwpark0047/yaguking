import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { usingEmulators } from '@/lib/env';
import { firebaseApp } from './app';

let db: Firestore | null = null;

/**
 * Firestore. **기기 캐시**와 함께 연다 — 한 번 받은 문서는 다시 읽어도 무료 읽기
 * 한도(하루 5만)를 쓰지 않는다. 이 모듈은 필요한 화면에서만 불러온다(묶음 크기).
 */
export function firestore(): Firestore {
  if (!db) {
    db = initializeFirestore(firebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (usingEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return db;
}
