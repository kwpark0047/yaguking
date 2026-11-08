import { Timestamp, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { firebaseAuth } from '@/lib/firebase/auth';
import { firestore } from '@/lib/firebase/db';
import { setFromData } from '@/lib/kbo/quiz';
import { publishAtOf, type KboKey, type KboQuestion, type KboSet, type KboSetKind, type KboSetState } from '@/lib/kbo/set';

/** 어제의 퀴즈 관리(저장소 맨 위 docs/daily-kbo-quiz/03-design.md §7). 쓰기는 모두 규칙의 isAdmin()이 지킨다 */
const uid = () => firebaseAuth().currentUser!.uid;
const log = (action: string, target: string, detail = '') => ({ by: uid(), action, target, detail: detail.slice(0, 500), at: serverTimestamp() });

/** 최근 묶음(여는 날 내림차순 — 문서 ID 내림차순은 Firestore가 지원하지 않는다). 읽기: 묶음 수 */
export async function listSets(count = 14): Promise<KboSet[]> {
  const snapshot = await getDocs(query(collection(firestore(), 'kboSets'), orderBy('publishAt', 'desc'), limit(count)));
  return snapshot.docs.map((item) => setFromData(item.id, item.data()));
}

/** 문항별 정답·해설·출처 — 관리자만 읽힌다. 읽기: 문항 수 */
export async function loadKeys(setId: string): Promise<Record<number, KboKey>> {
  const snapshot = await getDocs(collection(firestore(), 'kboSets', setId, 'keys'));
  return Object.fromEntries(snapshot.docs.map((item) => [Number(item.id), item.data() as KboKey]));
}

/** 관리자가 만드는 묶음(시즌 돌아보기, 경기 없음 안내). 초안으로 저장한다 */
export async function saveSet(id: string, kind: KboSetKind, gamesDate: string, items: readonly { question: KboQuestion; key: KboKey }[], state: KboSetState): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'kboSets', id), {
    kind,
    gamesDate,
    publishAt: Timestamp.fromMillis(publishAtOf(id)),
    questions: items.map((item) => item.question),
    state,
    withdrawn: [],
    isTest: false,
    updatedAt: serverTimestamp(),
    by: uid(),
  });
  items.forEach((item, index) => batch.set(doc(db, 'kboSets', id, 'keys', String(index)), item.key));
  batch.set(doc(collection(db, 'adminLogs')), log('kboSet.save', id, `${kind} ${items.length}문항`));
  await batch.commit();
}

/** 승인·보류 */
export async function setState(set: KboSet, state: KboSetState): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'kboSets', set.id), { state, updatedAt: serverTimestamp(), by: uid() });
  batch.set(doc(collection(db, 'adminLogs')), log(`kboSet.${state}`, set.id));
  await batch.commit();
}

/** 문항 철회 또는 되돌리기 — 공개 뒤에도 할 수 있다. 이미 푼 답은 집계에서 빠진다 */
export async function setWithdrawn(set: KboSet, index: number, withdrawn: boolean): Promise<void> {
  const db = firestore();
  const next = withdrawn ? [...new Set([...set.withdrawn, index])].sort((a, b) => a - b) : set.withdrawn.filter((item) => item !== index);
  const batch = writeBatch(db);
  batch.update(doc(db, 'kboSets', set.id), { withdrawn: next, updatedAt: serverTimestamp(), by: uid() });
  batch.set(doc(collection(db, 'adminLogs')), log(withdrawn ? 'kboSet.withdraw' : 'kboSet.restore', set.id, `문항 ${index + 1}`));
  await batch.commit();
}

export interface KboRun {
  at: number;
  gamesDate: string;
  setId: string;
  source: string;
  status: string;
  games: number;
  usable: number;
  pending: number;
  corrected: number;
  questions: number;
  problems: string[];
}

/** 실행 기록(운영자 PC가 쓴다). 읽기 1 */
export async function loadRuns(): Promise<KboRun[]> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'kboRuns'));
  return (snapshot.get('runs') as KboRun[] | undefined) ?? [];
}

export interface KboGameRow {
  gameId: string;
  label: string;
  status: string;
  usable: boolean;
  isTest: boolean;
  problems: string[];
  sourceName: string;
}

/** 그 경기일의 수집 상태. 읽기: 경기 수 */
export async function loadGames(gamesDate: string): Promise<KboGameRow[]> {
  const snapshot = await getDocs(query(collection(firestore(), 'kboGames'), where('date', '==', gamesDate), limit(10)));
  return snapshot.docs.map((item) => ({
    gameId: item.id,
    label: `${String(item.get('away.team') ?? '')} ${String(item.get('away.runs') ?? '')} : ${String(item.get('home.runs') ?? '')} ${String(item.get('home.team') ?? '')}`,
    status: String(item.get('status') ?? ''),
    usable: item.get('usable') === true,
    isTest: item.get('isTest') === true,
    problems: (item.get('problems') as string[] | undefined) ?? [],
    sourceName: String(item.get('source.name') ?? ''),
  }));
}

/** 다음 생성부터 쓰는 문제 수. 읽기 1 */
export async function loadQuestionCount(): Promise<number> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'kboQuiz'));
  return Number(snapshot.get('questionCount') ?? 5);
}

export async function saveQuestionCount(questionCount: number): Promise<void> {
  await setDoc(doc(firestore(), 'adminConfig', 'kboQuiz'), { questionCount, updatedAt: serverTimestamp(), by: uid() });
}

export interface KboStats {
  views: number;
  guestViews: number;
  starts: number;
  completes: number;
  signupClicks: number;
  signupCompletes: number;
  returned: number;
  questions: { index: number; answered: number; correct: number }[];
}

/** 집계(닫힌 묶음만 있다). 읽기 1 */
export async function loadStats(setId: string): Promise<KboStats | null> {
  const snapshot = await getDoc(doc(firestore(), 'kboSets', setId, 'stats', 'summary'));
  return snapshot.exists() ? (snapshot.data() as KboStats) : null;
}
