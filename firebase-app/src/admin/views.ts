import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore';
import {
  gamesSummary,
  hardestQuestions,
  kstDayStart,
  membersSummary,
  roomFlags,
  roomsSummary,
  type GameViewRow,
  type MemberViewRow,
  type RoomViewRow,
  type ViewId,
} from '@/lib/admin/views';
import type { Notice } from '@/lib/admin/notices';
import { firestore } from '@/lib/firebase/db';
import { firebaseAuth } from '@/lib/firebase/auth';

/**
 * 관리자 화면 "한 번 읽기"(docs/admin-dashboard-plan.md). 화면을 열 때 `readView`가 문서 하나만 읽는다.
 * `rebuild…`는 원본을 읽어(여러 번) 보기 문서를 다시 쓰고(1번), 관리자 기록을 같은 묶음에 남긴다.
 */
const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
const uidNow = () => firebaseAuth().currentUser!.uid;
const viewRef = (id: ViewId) => doc(firestore(), 'adminViews', id);

export interface View<T> {
  data: T;
  updatedAt: number;
}

/** 화면을 열 때 — 읽기 1 */
export async function readView<T>(id: ViewId): Promise<View<T> | null> {
  const snapshot = await getDoc(viewRef(id));
  if (!snapshot.exists()) return null;
  return { data: JSON.parse(String(snapshot.get('json'))) as T, updatedAt: ms(snapshot.get('updatedAt')) || Date.now() };
}

function setView(batch: WriteBatch, id: ViewId, data: unknown) {
  batch.set(viewRef(id), { json: JSON.stringify(data), by: uidNow(), updatedAt: serverTimestamp() });
}

function log(batch: WriteBatch, action: string, target: string, detail = '') {
  batch.set(doc(collection(firestore(), 'adminLogs')), { by: uidNow(), action, target, detail: detail.slice(0, 500), at: serverTimestamp() });
}

// ── 대시보드 ────────────────────────────────────────────────────────────────
export interface DashboardView {
  members?: ReturnType<typeof membersSummary> & { guests: number | null; guestsActive7d: number | null; syncedAt: number | null; builtAt: number };
  games?: ReturnType<typeof gamesSummary> & { builtAt: number };
  rooms?: ReturnType<typeof roomsSummary> & { builtAt: number };
  system?: { pendingTasks: number; builtAt: number };
}

/** 대시보드 문서의 한 칸만 바꾼다(다른 칸은 그대로) — 지금 문서를 읽어(1) 합쳐서 쓴다 */
async function patchDashboard(batch: WriteBatch, patch: DashboardView) {
  const current = (await readView<DashboardView>('dashboard'))?.data ?? {};
  setView(batch, 'dashboard', { ...current, ...patch });
}

// ── 회원 ─────────────────────────────────────────────────────────────────────
export interface MembersView {
  rows: MemberViewRow[];
  builtAt: number;
}

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function memberRow(uid: string, mirror: DocumentData | undefined, profile: DocumentData | undefined, summary: DocumentData | undefined): MemberViewRow {
  const level = profile?.levelTest;
  return {
    uid,
    email: mirror?.email ?? null,
    emailVerified: Boolean(mirror?.emailVerified),
    providers: strings(mirror?.providers),
    createdAt: ms(mirror?.createdAt) || ms(profile?.createdAt),
    lastSignInAt: ms(mirror?.lastSignInAt),
    disabled: Boolean(mirror?.disabled),
    admin: Boolean(mirror?.admin),
    ageConfirmedAt: profile?.ageConfirmedAt ? ms(profile.ageConfirmedAt) : null,
    nickname: typeof profile?.nickname === 'string' ? profile.nickname : null,
    favoriteTeams: strings(profile?.favoriteTeams),
    levelTest: level ? { tier: Number(level.tier), correct: Number(level.correct), total: Number(level.total), at: ms(level.completedAt) } : null,
    games: Number(summary?.games ?? 0),
    hits: Number(summary?.h ?? 0),
    atBats: Number(summary?.ab ?? 0),
    homeRuns: Number(summary?.hr ?? 0),
    lastGameAt: summary?.updatedAt ? ms(summary.updatedAt) : null,
  };
}

/** 계정 사본(운영자 PC 동기화) + 프로필 + 누적 → 회원 보기. 읽기: 사본 N + 프로필 N + 누적 N + 계정 통계 1 */
export async function rebuildMembers(now = Date.now()): Promise<MembersView> {
  const db = firestore();
  const [mirrors, profiles, stats] = await Promise.all([
    getDocs(collection(db, 'accountMirror')),
    getDocs(collection(db, 'users')),
    getDoc(doc(db, 'adminStats', 'accounts')),
  ]);
  const mirrorBy = new Map(mirrors.docs.map((item) => [item.id, item.data()]));
  const profileBy = new Map(profiles.docs.map((item) => [item.id, item.data()]));
  const uids = [...new Set([...mirrorBy.keys(), ...profileBy.keys()])];
  const summaries = await Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid, 'summary', 'main'))));
  const rows = uids
    .map((uid, index) => memberRow(uid, mirrorBy.get(uid), profileBy.get(uid), summaries[index]!.data()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const view: MembersView = { rows, builtAt: now };
  const batch = writeBatch(db);
  setView(batch, 'members', view);
  await patchDashboard(batch, {
    members: {
      ...membersSummary(rows, now),
      guests: stats.exists() ? Number(stats.get('guests')) : null,
      guestsActive7d: stats.exists() ? Number(stats.get('guestsActive7d')) : null,
      syncedAt: stats.exists() ? ms(stats.get('syncedAt')) || null : null,
      builtAt: now,
    },
  });
  log(batch, 'build-view', 'members', `${rows.length}명`);
  await batch.commit();
  return view;
}

// ── 경기 ─────────────────────────────────────────────────────────────────────
export interface GamesView {
  /** 최근 경기(최대 100, 타석 포함) */
  rows: GameViewRow[];
  summary: ReturnType<typeof gamesSummary>;
  hardest: ReturnType<typeof hardestQuestions>;
  /** 오늘 경기를 몇 개까지 읽었나(상한에 닿으면 요약이 표본) */
  scanned: number;
  capped: boolean;
  dayStart: number;
  builtAt: number;
}

export const GAMES_SCAN_MAX = 500;
const GAMES_KEEP = 100;

/** 오늘(한국 시간) 경기. 읽기: 회원 보기 1 + 경기 최대 500 */
export async function rebuildGames(now = Date.now()): Promise<GamesView> {
  const db = firestore();
  const members = (await readView<MembersView>('members'))?.data.rows ?? [];
  const nickname = new Map(members.map((row) => [row.uid, row.nickname]));
  const isMember = new Set(members.map((row) => row.uid));
  const dayStart = kstDayStart(now);
  const snapshot = await getDocs(
    query(collectionGroup(db, 'games'), where('createdAt', '>=', Timestamp.fromMillis(dayStart)), orderBy('createdAt', 'desc'), limit(GAMES_SCAN_MAX)),
  );
  const rows: GameViewRow[] = snapshot.docs.map((item) => {
    const uid = item.ref.parent.parent?.id ?? '';
    const atBats = Array.isArray(item.get('atBats')) ? (item.get('atBats') as GameViewRow['atBats']) : [];
    return {
      id: item.id,
      uid,
      nickname: nickname.get(uid) ?? null,
      member: isMember.has(uid),
      mode: String(item.get('mode') ?? ''),
      createdAt: ms(item.get('createdAt')),
      runs: Number(item.get('runs') ?? 0),
      pa: Number(item.get('pa') ?? 0),
      atBats: atBats.map((atBat) => ({
        questionId: String(atBat.questionId),
        choice: atBat.choice ?? null,
        correct: Boolean(atBat.correct),
        elapsedMs: Number(atBat.elapsedMs ?? 0),
        result: String(atBat.result ?? ''),
        rbi: Number(atBat.rbi ?? 0),
      })),
    };
  });
  const summary = gamesSummary(rows);
  const view: GamesView = {
    rows: rows.slice(0, GAMES_KEEP),
    summary,
    hardest: hardestQuestions(rows),
    scanned: rows.length,
    capped: rows.length >= GAMES_SCAN_MAX,
    dayStart,
    builtAt: now,
  };
  const batch = writeBatch(db);
  setView(batch, 'games', view);
  await patchDashboard(batch, { games: { ...summary, builtAt: now } });
  log(batch, 'build-view', 'games', `${rows.length}경기`);
  await batch.commit();
  return view;
}

/** 같은 플레이어의 오늘 경기 수(보기 안의 줄로 셈 — 상한에 닿으면 적게 셀 수 있다) */
export function gamesPerUid(rows: readonly GameViewRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.uid, (counts.get(row.uid) ?? 0) + 1);
  return counts;
}

// ── 대결 방 ──────────────────────────────────────────────────────────────────
export interface RoomsView {
  rows: RoomViewRow[];
  builtAt: number;
}

const ROOMS_MAX = 100;

/** 방 최대 100개 + 각 방의 자리. 읽기: 방 N + 자리 합계 + 대기 작업 세기 1 */
export async function rebuildRooms(now = Date.now()): Promise<RoomsView> {
  const db = firestore();
  const [rooms, pending] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(ROOMS_MAX))),
    getCountFromServer(query(collection(db, 'adminTasks'), where('status', '==', 'pending'))),
  ]);
  const seats = await Promise.all(rooms.docs.map((room) => getDocs(collection(db, 'rooms', room.id, 'players'))));
  const rows: RoomViewRow[] = rooms.docs.map((room, index) => ({
    code: room.id,
    status: room.get('status'),
    hostUid: String(room.get('hostUid') ?? ''),
    createdAt: ms(room.get('createdAt')),
    startedAt: room.get('startedAt') ? ms(room.get('startedAt')) : null,
    maxPlayers: Number(room.get('maxPlayers') ?? 0),
    players: strings(room.get('playerIds')).length,
    questions: strings(room.get('questionIds')).length,
    seats: seats[index]!.docs.map((seat) => {
      const answers = Array.isArray(seat.get('answers')) ? (seat.get('answers') as { correct?: boolean }[]) : [];
      return {
        uid: seat.id,
        nickname: String(seat.get('nickname') ?? ''),
        score: Number(seat.get('score') ?? 0),
        answered: answers.length,
        correct: answers.filter((answer) => answer.correct).length,
        lastAnswerAt: seat.get('updatedAt') ? ms(seat.get('updatedAt')) : null,
      };
    }),
  }));
  const view: RoomsView = { rows, builtAt: now };
  const batch = writeBatch(db);
  setView(batch, 'rooms', view);
  await patchDashboard(batch, { rooms: { ...roomsSummary(rows, now), builtAt: now }, system: { pendingTasks: pending.data().count, builtAt: now } });
  log(batch, 'build-view', 'rooms', `${rows.length}개`);
  await batch.commit();
  return view;
}

/** 24시간 지난 방과 자리를 지운다(정리 작업과 같은 기준) — 화면이 가진 보기에서 고른다 */
export async function cleanupExpiredRooms(rows: readonly RoomViewRow[], now = Date.now()): Promise<number> {
  const db = firestore();
  const expired = rows.filter((room) => roomFlags(room, now).includes('expired'));
  if (expired.length === 0) return 0;
  const batch = writeBatch(db);
  for (const room of expired) {
    for (const seat of room.seats) batch.delete(doc(db, 'rooms', room.code, 'players', seat.uid));
    batch.delete(doc(db, 'rooms', room.code));
  }
  log(batch, 'cleanup-rooms', expired.map((room) => room.code).join(',').slice(0, 128), `${expired.length}개`);
  await batch.commit();
  return expired.length;
}

/** 대시보드 "모두 새로 만들기" — 회원 → 경기(회원 보기를 씀) → 방 순서 */
export async function rebuildAll(now = Date.now()): Promise<void> {
  await rebuildMembers(now);
  await rebuildGames(now);
  await rebuildRooms(now);
}

// ── 공지·기록 ────────────────────────────────────────────────────────────────
export interface NoticesView {
  notices: Notice[];
  builtAt: number;
}

/** 공지 저장과 같은 묶음에서 공지 보기를 다시 쓴다(data.ts saveNotice) */
export function setNoticesView(batch: WriteBatch, notices: readonly Notice[], now = Date.now()) {
  setView(batch, 'notices', { notices: [...notices], builtAt: now } satisfies NoticesView);
}

export interface LogsView {
  logs: { id: string; by: string; action: string; target: string; detail: string; at: number }[];
  builtAt: number;
}

/** 관리자 기록 최근 100개. 읽기 100 */
export async function rebuildLogs(now = Date.now()): Promise<LogsView> {
  const db = firestore();
  const snapshot = await getDocs(query(collection(db, 'adminLogs'), orderBy('at', 'desc'), limit(100)));
  const view: LogsView = {
    logs: snapshot.docs.map((item) => ({
      id: item.id,
      by: String(item.get('by') ?? ''),
      action: String(item.get('action') ?? ''),
      target: String(item.get('target') ?? ''),
      detail: String(item.get('detail') ?? ''),
      at: ms(item.get('at')),
    })),
    builtAt: now,
  };
  const batch = writeBatch(db);
  setView(batch, 'logs', view);
  await batch.commit();
  return view;
}

/** 열람 기록만 따로(화면을 열 때·이메일을 볼 때) — 쓰기 1 */
export async function logView(action: string, target: string, detail = ''): Promise<void> {
  const batch = writeBatch(firestore());
  log(batch, action, target, detail);
  await batch.commit();
}
