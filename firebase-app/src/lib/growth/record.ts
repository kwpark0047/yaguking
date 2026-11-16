import { doc, setDoc } from 'firebase/firestore';
import { kstDayKey } from '@/lib/data/keys';
import { firestore } from '@/lib/firebase/db';
import { countWrites } from '@/lib/firebase/meter';
import { acquisitionStarted, clearAcquisition, pendingAcquisition } from './acquisition';

/**
 * 비회원 계정이 막 생겼을 때 한 번 — 이번 방문에 남긴 유입 출처를 `users/{uid}/meta/acquisition`에 쓴다(쓰기 1).
 * 규칙이 만들기만 허락한다(고치기 없음). 실패해도 게임에는 영향이 없다 — 조용히 넘어간다.
 */
export async function recordAcquisition(uid: string, now: number = Date.now()): Promise<boolean> {
  const found = pendingAcquisition();
  if (!found || !acquisitionStarted(now)) return false;
  try {
    await setDoc(doc(firestore(), 'users', uid, 'meta', 'acquisition'), {
      source: found.source,
      campaign: found.campaign,
      day: Number(kstDayKey(now)),
    });
    countWrites('recordAcquisition', 1);
    clearAcquisition();
    return true;
  } catch {
    return false;
  }
}
