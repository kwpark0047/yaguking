import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { buildPublicNotices, type Notice } from '@/lib/admin/notices';
import type { MirrorFacts, ProfileFacts } from '@/lib/admin/signupCheck';
import { nicknameKey } from '@/lib/data/keys';
import { firestore } from '@/lib/firebase/db';
import { firebaseAuth } from '@/lib/firebase/auth';

/**
 * 관리자 화면의 Firestore 읽기·쓰기(docs/admin-plan.md). 보안 규칙이 관리자에게만 연다.
 * 1차는 회원 기록을 **읽기만** 한다. 쓰기는 공지·공개 묶음·작업 요청·관리자 기록뿐이다.
 * 개인정보를 보거나 바꾸는 행동은 같은 묶음 안에서 `adminLogs`에 남긴다(접속기록, 1년 이상 보관).
 */
const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export const PAGE_SIZE = 30;

const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
const uidNow = () => firebaseAuth().currentUser!.uid;

/** 한국 날짜 오늘 0시(ms) */
export function kstDayStart(now: number = Date.now()): number {
  return Math.floor((now + KST) / DAY) * DAY - KST;
}

function logEntry(action: string, target: string, detail = '') {
  return { by: uidNow(), action, target, detail: detail.slice(0, 500), at: serverTimestamp() };
}

/** 관리자 기록 하나(따로 쓸 때) */
export async function logAdmin(action: string, target: string, detail = ''): Promise<void> {
  const batch = writeBatch(firestore());
  batch.set(doc(collection(firestore(), 'adminLogs')), logEntry(action, target, detail));
  await batch.commit();
}

// ── 대시보드 ────────────────────────────────────────────────────────────────
export interface DashboardNumbers {
  members: number;
  signupsToday: number;
  gamesToday: number;
  rooms: number;
  pendingTasks: number;
  guests: number | null;
  guestsActive7d: number | null;
  syncedAt: number | null;
  countedAt: number;
}

export async function loadDashboard(now: number = Date.now()): Promise<DashboardNumbers> {
  const db = firestore();
  const today = Timestamp.fromMillis(kstDayStart(now));
  const [members, signupsToday, gamesToday, rooms, pendingTasks, stats] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getCountFromServer(query(collection(db, 'users'), where('createdAt', '>=', today))),
    getCountFromServer(query(collectionGroup(db, 'games'), where('createdAt', '>=', today))),
    getCountFromServer(collection(db, 'rooms')),
    getCountFromServer(query(collection(db, 'adminTasks'), where('status', '==', 'pending'))),
    getDoc(doc(db, 'adminStats', 'accounts')),
  ]);
  return {
    members: members.data().count,
    signupsToday: signupsToday.data().count,
    gamesToday: gamesToday.data().count,
    rooms: rooms.data().count,
    pendingTasks: pendingTasks.data().count,
    guests: stats.exists() ? Number(stats.get('guests')) : null,
    guestsActive7d: stats.exists() ? Number(stats.get('guestsActive7d')) : null,
    syncedAt: stats.exists() ? ms(stats.get('syncedAt')) || null : null,
    countedAt: now,
  };
}

/** 계정 동기화 요청 — 운영자 PC 작업이 처리(매일 03:30 또는 수동 실행) */
export async function requestAccountSync(): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'adminTasks')), {
    type: 'syncAccounts',
    target: '',
    status: 'pending',
    by: uidNow(),
    requestedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, 'adminLogs')), logEntry('request-sync', 'accounts'));
  await batch.commit();
}

// ── 가입자 ──────────────────────────────────────────────────────────────────
export interface MemberRow {
  uid: string;
  email: string | null;
  mirror: MirrorFacts & { createdAt: number; lastSignInAt: number; disabled: boolean };
  profile: (ProfileFacts & { favoritePlayers: string[] }) | null;
}

function profileOf(data: DocumentData | undefined): MemberRow['profile'] {
  if (!data) return null;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  return {
    ageConfirmed: data.ageConfirmedAt != null,
    nickname: typeof data.nickname === 'string' ? data.nickname : null,
    favoriteTeams: strings(data.favoriteTeams),
    favoritePlayers: strings(data.favoritePlayers),
  };
}

function rowOf(snapshot: QueryDocumentSnapshot | DocumentData, uid: string, profile: MemberRow['profile']): MemberRow {
  const data = 'data' in snapshot && typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
  return {
    uid,
    email: data.email ?? null,
    mirror: {
      emailVerified: Boolean(data.emailVerified),
      providers: Array.isArray(data.providers) ? data.providers : [],
      createdAt: ms(data.createdAt),
      lastSignInAt: ms(data.lastSignInAt),
      disabled: Boolean(data.disabled),
    },
    profile,
  };
}

export interface MemberPage {
  rows: MemberRow[];
  cursor: QueryDocumentSnapshot | null;
}

/** 최근 가입 순 30명(계정 사본 기준) + 각자의 프로필 */
export async function loadMembers(after: QueryDocumentSnapshot | null = null, size = PAGE_SIZE): Promise<MemberPage> {
  const db = firestore();
  const base = collection(db, 'accountMirror');
  const snapshot = await getDocs(
    after ? query(base, orderBy('createdAt', 'desc'), startAfter(after), limit(size)) : query(base, orderBy('createdAt', 'desc'), limit(size)),
  );
  const profiles = await Promise.all(snapshot.docs.map((item) => getDoc(doc(db, 'users', item.id))));
  return {
    rows: snapshot.docs.map((item, index) => rowOf(item, item.id, profileOf(profiles[index]!.data()))),
    cursor: snapshot.size === size ? snapshot.docs[snapshot.size - 1]! : null,
  };
}

/** 닉네임 앞글자 검색(대소문자 무시 — 예약 문서 ID가 소문자) → 최대 10명 */
export async function searchByNickname(prefix: string): Promise<MemberRow[]> {
  const key = nicknameKey(prefix);
  if (!key) return [];
  const db = firestore();
  const found = await getDocs(
    query(collection(db, 'nicknames'), where(documentId(), '>=', key), where(documentId(), '<', `${key}`), limit(10)),
  );
  const uids = found.docs.map((item) => String(item.get('uid')));
  const rows = await Promise.all(uids.map((uid) => loadMemberRow(uid)));
  return rows.filter((row): row is MemberRow => row !== null);
}

export async function loadMemberRow(uid: string): Promise<MemberRow | null> {
  const db = firestore();
  const [mirror, profile] = await Promise.all([getDoc(doc(db, 'accountMirror', uid)), getDoc(doc(db, 'users', uid))]);
  if (!mirror.exists() && !profile.exists()) return null;
  return rowOf(mirror.exists() ? mirror.data() : {}, uid, profileOf(profile.data()));
}

export interface MemberDetail {
  row: MemberRow;
  summary: Record<string, number> | null;
  levelTest: { correct: number; total: number; tier: number } | null;
  wrongNotes: number;
  recentGames: { id: string; createdAt: number; runs: number; pa: number; mode: string }[];
}

/** 회원 한 명 — 열 때마다 관리자 기록을 남긴다(개인정보 접속기록) */
export async function loadMemberDetail(uid: string): Promise<MemberDetail | null> {
  const db = firestore();
  const row = await loadMemberRow(uid);
  if (!row) return null;
  const [summary, profile, wrongNotes, games] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'summary', 'main')),
    getDoc(doc(db, 'users', uid)),
    getCountFromServer(collection(db, 'users', uid, 'wrongNotes')),
    getDocs(query(collection(db, 'users', uid, 'games'), orderBy('createdAt', 'desc'), limit(5))),
  ]);
  await logAdmin('view-member', uid);
  const level = profile.get('levelTest');
  return {
    row,
    summary: summary.exists()
      ? Object.fromEntries(Object.entries(summary.data()).filter(([, value]) => typeof value === 'number')) as Record<string, number>
      : null,
    levelTest: level ? { correct: Number(level.correct), total: Number(level.total), tier: Number(level.tier) } : null,
    wrongNotes: wrongNotes.data().count,
    recentGames: games.docs.map((item) => ({
      id: item.id,
      createdAt: ms(item.get('createdAt')),
      runs: Number(item.get('runs') ?? 0),
      pa: Number(item.get('pa') ?? 0),
      mode: String(item.get('mode') ?? ''),
    })),
  };
}

// ── 공지사항 ────────────────────────────────────────────────────────────────
function noticeOf(item: QueryDocumentSnapshot): Notice {
  return {
    id: item.id,
    title: String(item.get('title') ?? ''),
    body: String(item.get('body') ?? ''),
    startsAt: ms(item.get('startsAt')),
    endsAt: item.get('endsAt') ? ms(item.get('endsAt')) : null,
    pinned: Boolean(item.get('pinned')),
    hidden: Boolean(item.get('hidden')),
    createdAt: ms(item.get('createdAt')),
  };
}

export async function loadNotices(): Promise<Notice[]> {
  const snapshot = await getDocs(query(collection(firestore(), 'notices'), orderBy('startsAt', 'desc'), limit(100)));
  return snapshot.docs.map(noticeOf);
}

export type NoticeInput = Omit<Notice, 'id' | 'createdAt'>;

/**
 * 공지 저장·삭제와 공개 묶음(public/home) 다시 만들기를 **한 묶음**으로 — 원본과 공개본이 어긋나지 않게.
 * `existing`은 화면이 가진 전체 공지 목록(공개 묶음 계산용).
 */
export async function saveNotice(id: string | null, input: NoticeInput | null, existing: readonly Notice[]): Promise<string> {
  const db = firestore();
  const ref = id ? doc(db, 'notices', id) : doc(collection(db, 'notices'));
  const batch = writeBatch(db);
  let next = existing.filter((notice) => notice.id !== ref.id);
  if (input) {
    const previous = existing.find((notice) => notice.id === ref.id);
    batch.set(ref, {
      title: input.title.trim(),
      body: input.body,
      startsAt: Timestamp.fromMillis(input.startsAt),
      endsAt: input.endsAt === null ? null : Timestamp.fromMillis(input.endsAt),
      pinned: input.pinned,
      hidden: input.hidden,
      createdAt: previous?.createdAt ? Timestamp.fromMillis(previous.createdAt) : Timestamp.now(),
      updatedAt: serverTimestamp(),
      by: uidNow(),
    });
    next = [...next, { id: ref.id, ...input, title: input.title.trim() }];
  } else {
    batch.delete(ref);
  }
  const notices = buildPublicNotices(next, Date.now()).map((notice) => ({
    ...notice,
    startsAt: Timestamp.fromMillis(notice.startsAt),
    endsAt: notice.endsAt === null ? null : Timestamp.fromMillis(notice.endsAt),
  }));
  batch.set(doc(db, 'public', 'home'), { notices, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'adminLogs')), logEntry(input ? (id ? 'update-notice' : 'create-notice') : 'delete-notice', ref.id, input?.title ?? ''));
  await batch.commit();
  return ref.id;
}

// ── 관리자 기록 ─────────────────────────────────────────────────────────────
export interface LogRow {
  id: string;
  by: string;
  action: string;
  target: string;
  detail: string;
  at: number;
}

export async function loadLogs(size = 50): Promise<LogRow[]> {
  const snapshot = await getDocs(query(collection(firestore(), 'adminLogs'), orderBy('at', 'desc'), limit(size)));
  return snapshot.docs.map((item) => ({
    id: item.id,
    by: String(item.get('by')),
    action: String(item.get('action')),
    target: String(item.get('target')),
    detail: String(item.get('detail') ?? ''),
    at: ms(item.get('at')),
  }));
}
