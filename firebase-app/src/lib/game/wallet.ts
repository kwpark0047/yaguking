import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';

/**
 * 힌트 지갑(docs/hint-plan.md §3) — users/{uid}/wallet/main. 쓸 수 있는 포인트 = 모은 포인트(earned, 운영자 PC가 매일 0시) − 쓴 포인트(spent).
 * 월간 등수는 모은 포인트로 매기므로 힌트를 써도 등수는 그대로다. Firestore를 쓰므로 힌트 창을 처음 열 때 불러온다(회원만).
 */
const MEMORY_MS = 10 * 60_000;
const remembered = new Map<string, { at: number; available: Promise<number> }>();

const availableOf = (data: { earned?: unknown; spent?: unknown } | undefined) =>
  Math.max(0, Number(data?.earned ?? 0) - Number(data?.spent ?? 0));

/** 쓸 수 있는 포인트 — 읽기 1번. 문서가 없으면 0. 문제마다 다시 읽지 않게 10분 기억한다 */
export function loadWallet(uid: string, now = Date.now()): Promise<number> {
  const cached = remembered.get(uid);
  if (cached && now - cached.at < MEMORY_MS) return cached.available;
  const available = getDoc(doc(firestore(), 'users', uid, 'wallet', 'main')).then((snapshot) => {
    countReads('loadWallet', 1);
    return availableOf(snapshot.data());
  });
  remembered.set(uid, { at: now, available });
  available.catch(() => remembered.delete(uid)); // 실패는 기억하지 않는다
  return available;
}

export class NotEnoughPoints extends Error {}

/**
 * 포인트 쓰기 — 서버가 받아들인 뒤에야 힌트를 보여 준다. 묶음 쓰기와 달리 트랜잭션은 오프라인이면 실패해서,
 * 쓰기가 기기에 쌓였다가 나중에 포인트만 빠지는 일이 없다. 읽기 1·쓰기 1. 남은 포인트를 돌려준다.
 */
export async function spendHint(uid: string, cost: number, now = Date.now()): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const db = firestore();
  const ref = doc(db, 'users', uid, 'wallet', 'main');
  const left = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const available = availableOf(snapshot.data());
    if (!snapshot.exists() || available < cost) throw new NotEnoughPoints();
    transaction.update(ref, { spent: Number(snapshot.get('spent') ?? 0) + cost, updatedAt: serverTimestamp() });
    return available - cost;
  });
  countReads('spendHint', 1);
  countWrites('spendHint', 1);
  remembered.set(uid, { at: now, available: Promise.resolve(left) });
  return left;
}
