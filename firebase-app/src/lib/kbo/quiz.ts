import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { OptionLabel } from '@/content/questions';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';
import { currentSetId, previousSetId, type KboKey, type KboQuestion, type KboSet, type KboSetKind, type KboSetState } from './set';

/**
 * 어제의 KBO 퀴즈 읽고 쓰기. 정답은 이 묶음에 없고, 규칙이 "그 문제에 답을 낸 뒤에만" 정답 문서를 연다.
 * 다 풀 때 읽기: 묶음 1 + 내 시도 1 + 정답 5(규칙 조회 5 별도). 쓰기: 들어올 때 1 + 답 5.
 */
const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);

export function setFromData(id: string, data: Record<string, unknown>): KboSet {
  return {
    id,
    kind: String(data.kind ?? 'no-game') as KboSetKind,
    gamesDate: String(data.gamesDate ?? ''),
    publishAt: millis(data.publishAt),
    questions: (Array.isArray(data.questions) ? data.questions : []) as KboQuestion[],
    state: String(data.state ?? 'draft') as KboSetState,
    withdrawn: (Array.isArray(data.withdrawn) ? data.withdrawn : []).map(Number),
    isTest: data.isTest === true,
  };
}

/** 묶음 하나 — 없거나 아직 열리지 않았으면 null. 읽기 1번 */
export async function loadSet(id: string): Promise<KboSet | null> {
  try {
    const snapshot = await getDoc(doc(firestore(), 'kboSets', id));
    countReads('loadKboSet', 1);
    return snapshot.exists() ? setFromData(id, snapshot.data()) : null;
  } catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') return null;
    throw error;
  }
}

/** 지금 보여 줄 묶음 — 오늘 것, 없으면 하루 전 것(날짜를 함께 보여 준다). 읽기 1~2번 */
export async function loadLatestSet(now: number = Date.now()): Promise<{ set: KboSet | null; current: boolean }> {
  const id = currentSetId(now);
  const today = await loadSet(id);
  if (today) return { set: today, current: true };
  return { set: await loadSet(previousSetId(id)), current: false };
}

export interface KboAttempt {
  total: number;
  answers: Record<string, OptionLabel | null>;
}

/** 내 시도 — 없으면 null. 읽기 1번 */
export async function loadAttempt(setId: string, uid: string): Promise<KboAttempt | null> {
  const snapshot = await getDoc(doc(firestore(), 'kboSets', setId, 'attempts', uid));
  countReads('loadKboAttempt', 1);
  if (!snapshot.exists()) return null;
  const answers: KboAttempt['answers'] = {};
  for (const [index, value] of Object.entries((snapshot.get('answers') ?? {}) as Record<string, { choice?: OptionLabel | null }>)) {
    answers[index] = value.choice ?? null;
  }
  return { total: Number(snapshot.get('total') ?? 0), answers };
}

/** 화면에 들어옴 — 시도 문서를 만든다(사람당 하나라 지표가 겹치지 않는다). 쓰기 1번 */
export async function createAttempt(setId: string, uid: string, total: number, guest: boolean): Promise<void> {
  await setDoc(doc(firestore(), 'kboSets', setId, 'attempts', uid), { guest, total, answers: {}, viewedAt: serverTimestamp() });
  countWrites('createKboAttempt', 1);
}

/** 답 하나 — 순서대로만, 고칠 수 없다(규칙). 시간 초과·철회된 문제는 choice null. 쓰기 1번 */
export async function submitAnswer(setId: string, uid: string, index: number, choice: OptionLabel | null): Promise<void> {
  await updateDoc(doc(firestore(), 'kboSets', setId, 'attempts', uid), { [`answers.${index}`]: { choice, at: serverTimestamp() } });
  countWrites('answerKbo', 1);
}

/** 정답 — 답을 낸 문제만 읽힌다. 읽기 1번 */
export async function loadKey(setId: string, index: number): Promise<KboKey> {
  const snapshot = await getDoc(doc(firestore(), 'kboSets', setId, 'keys', String(index)));
  countReads('loadKboKey', 1);
  return {
    correct: String(snapshot.get('correct') ?? '') as OptionLabel,
    explanation: String(snapshot.get('explanation') ?? ''),
    sourceName: String(snapshot.get('sourceName') ?? ''),
    sourceUrl: String(snapshot.get('sourceUrl') ?? ''),
    recordAsOf: String(snapshot.get('recordAsOf') ?? ''),
  };
}

/** 가입 단추 — 한 번만 남는다. 실패해도 가입을 막지 않는다. 쓰기 1번 */
export async function markSignupClick(setId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(firestore(), 'kboSets', setId, 'attempts', uid), { signupClickedAt: serverTimestamp() });
    countWrites('kboSignupClick', 1);
  } catch {
    // 지표 하나 놓치는 것뿐이다(두 번째 누름은 규칙이 거절한다)
  }
}

// ── 홈 카드 — 묶음 문서를 기기당 하루 한 번만 읽는다 ──
const CARD_KEY = 'yk_kbo_card';
const RETRY_MS = 10 * 60_000;

export interface KboCard {
  setId: string;
  kind: KboSetKind;
  gamesDate: string;
  total: number;
}

/** 저장된 카드 — 오늘 묶음이면 그대로, 준비 전 기록이면 10분 동안만 믿는다 */
export function readCardCache(now: number = Date.now()): { card: KboCard | null } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_KEY) ?? 'null') as { day: string; at: number; current: boolean; card: KboCard | null } | null;
    if (!saved || saved.day !== currentSetId(now)) return null;
    if (!saved.current && now - saved.at > RETRY_MS) return null;
    return { card: saved.card };
  } catch {
    return null;
  }
}

export async function loadCard(now: number = Date.now()): Promise<KboCard | null> {
  const cached = readCardCache(now);
  if (cached) return cached.card;
  const { set, current } = await loadLatestSet(now);
  const card = set ? { setId: set.id, kind: set.kind, gamesDate: set.gamesDate, total: set.questions.length - set.withdrawn.length } : null;
  try {
    // 오늘 묶음이 아니면 10분 뒤 다시 본다(그동안은 하루 전 묶음을 날짜와 함께 보여 준다)
    localStorage.setItem(CARD_KEY, JSON.stringify({ day: currentSetId(now), at: now, current, card }));
  } catch {
    // 저장소가 막혀 있으면 다음에 다시 읽는다
  }
  return card;
}
