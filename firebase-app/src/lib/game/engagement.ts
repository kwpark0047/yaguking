import { arrayUnion, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';
import { kstDayOfMonth, kstMonthKey, type Leaderboard, type LeaderboardEntry, type Title } from './attendance';

/**
 * 출석·월간 등수 읽고 쓰기(docs/engagement-plan.md). 계산은 attendance.ts.
 *
 * - 출석 도장: 쓰기 1번. 규칙이 서버 기준 오늘만 받는다
 * - 홈과 등수 화면이 같은 문서를 읽으므로 앱을 쓰는 동안 기억해 둔다(다시 읽지 않음). 등수 문서는 하루 한 번 바뀌어 10분 기억.
 *   읽는 중인 요청도 기억한다 — 같은 문서를 동시에 두 번 읽지 않게(화면이 동시에 열리거나 개발 모드의 두 번 실행)
 */
const attendanceCache = new Map<string, Promise<number[]>>();
const boardCache = new Map<string, { at: number; value: Promise<Leaderboard | null> }>();
const BOARD_TTL_MS = 10 * 60_000;

const daysOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((day): day is number => Number.isInteger(day)) : [];

/** 그 달 출석한 날(1~31). 읽기 1번(기억해 둔 것은 0) */
export async function loadAttendance(uid: string, month: string): Promise<number[]> {
  const key = `${uid}/${month}`;
  const cached = attendanceCache.get(key);
  if (cached) return cached;
  const pending = getDoc(doc(firestore(), 'users', uid, 'attendance', month)).then((snapshot) => {
    countReads('loadAttendance', 1);
    return daysOf(snapshot.get('days'));
  });
  attendanceCache.set(key, pending);
  pending.catch(() => attendanceCache.delete(key)); // 실패는 기억하지 않는다
  return pending;
}

/** 오늘 출석 도장 — 쓰기 1번. 찍은 뒤의 이번 달 목록 */
export async function stampToday(uid: string, now: number = Date.now()): Promise<number[]> {
  const month = kstMonthKey(now);
  const today = kstDayOfMonth(now);
  await setDoc(
    doc(firestore(), 'users', uid, 'attendance', month),
    { days: arrayUnion(today), updatedAt: serverTimestamp() },
    { merge: true },
  );
  countWrites('stampAttendance', 1);
  const before = await (attendanceCache.get(`${uid}/${month}`) ?? Promise.resolve([] as number[])).catch(() => [] as number[]);
  const days = [...before.filter((day) => day !== today), today];
  attendanceCache.set(`${uid}/${month}`, Promise.resolve(days));
  return days;
}

/** 이번 달 연습 점수(비공식) — 읽기 1번 */
export async function loadMonthlyPractice(uid: string, month: string): Promise<{ games: number; xp: number }> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'monthly', month));
  countReads('loadMonthlyPractice', 1);
  return { games: Number(snapshot.get('games') ?? 0), xp: Number(snapshot.get('xp') ?? 0) };
}

const TITLES: readonly Title[] = ['king', 'allstar', 'hall', 'perfect'];
const titlesOf = (value: unknown) => (Array.isArray(value) ? value.filter((title): title is Title => TITLES.includes(title)) : []);

function entryOf(value: Record<string, unknown>): LeaderboardEntry {
  return {
    rank: Number(value.rank ?? 0),
    nickname: String(value.nickname ?? ''),
    team: typeof value.team === 'string' ? value.team : null,
    points: Number(value.points ?? 0),
    days: Number(value.days ?? 0),
    official: Number(value.official ?? 0),
    rounds: Number(value.rounds ?? 0),
    titles: titlesOf(value.titles),
  };
}

/** 그 달 등수 문서 — 읽기 1번(10분 기억). 아직 없으면 null */
export async function loadLeaderboard(month: string): Promise<Leaderboard | null> {
  const cached = boardCache.get(month);
  if (cached && Date.now() - cached.at < BOARD_TTL_MS) return cached.value;
  const value = readLeaderboard(month);
  boardCache.set(month, { at: Date.now(), value });
  value.catch(() => boardCache.delete(month));
  return value;
}

async function readLeaderboard(month: string): Promise<Leaderboard | null> {
  const snapshot = await getDoc(doc(firestore(), 'leaderboards', month));
  countReads('loadLeaderboard', 1);
  let value: Leaderboard | null = null;
  if (snapshot.exists()) {
    const data = snapshot.data();
    const histogram: Record<string, number> = {};
    for (const [points, count] of Object.entries((data.histogram ?? {}) as Record<string, unknown>)) histogram[points] = Number(count);
    value = {
      month,
      top: Array.isArray(data.top) ? data.top.map((item) => entryOf(item as Record<string, unknown>)) : [],
      participants: Number(data.participants ?? 0),
      histogram,
      through: Number(data.through ?? 0),
      final: data.final === true,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0,
    };
  }
  return value;
}

/** 확정된 달의 내 칭호 — 읽기 1번 */
export async function loadAward(uid: string, month: string): Promise<{ rank: number; titles: Title[] } | null> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'awards', month));
  countReads('loadAward', 1);
  return snapshot.exists() ? { rank: Number(snapshot.get('rank') ?? 0), titles: titlesOf(snapshot.get('titles')) } : null;
}

/** 등수에서 닉네임 숨기기 — 쓰기 1번. 다음 날 새벽 등수부터 반영 */
export async function saveRankingHidden(uid: string, hidden: boolean): Promise<void> {
  await updateDoc(doc(firestore(), 'users', uid), { rankingHidden: hidden, updatedAt: serverTimestamp() });
  countWrites('saveRankingHidden', 1);
}

/** 이번 달 공식 점수(날짜별) — 운영자 PC가 판정해 쓴다. 읽기 1번(앱을 쓰는 동안 기억) */
const officialCache = new Map<string, Promise<Record<string, number>>>();
export function loadOfficialMonth(uid: string, month: string): Promise<Record<string, number>> {
  const key = `${uid}/${month}`;
  const cached = officialCache.get(key);
  if (cached) return cached;
  const pending = getDoc(doc(firestore(), 'users', uid, 'officialMonth', month)).then((snapshot) => {
    countReads('loadOfficialMonth', 1);
    const days: Record<string, number> = {};
    for (const [day, points] of Object.entries((snapshot.get('days') ?? {}) as Record<string, unknown>)) days[day] = Number(points);
    return days;
  });
  officialCache.set(key, pending);
  pending.catch(() => officialCache.delete(key));
  return pending;
}
