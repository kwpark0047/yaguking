import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { buildPublicNotices, type Notice } from '@/lib/admin/notices';
import type { NewsPost } from '@/lib/news/validate';
import { firestore } from '@/lib/firebase/db';
import { firebaseAuth } from '@/lib/firebase/auth';
import { setNoticesView } from './views';

/**
 * 관리자 화면의 Firestore 읽기·쓰기(docs/admin-plan.md). 보안 규칙이 관리자에게만 연다.
 * 1차는 회원 기록을 **읽기만** 한다. 쓰기는 공지·공개 묶음·작업 요청·관리자 기록뿐이다.
 * 개인정보를 보거나 바꾸는 행동은 같은 묶음 안에서 `adminLogs`에 남긴다(접속기록, 2년 보관).
 * 화면을 열 때의 "한 번 읽기" 보기는 views.ts.
 */
const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
const uidNow = () => firebaseAuth().currentUser!.uid;

function logEntry(action: string, target: string, detail = '') {
  return { by: uidNow(), action, target, detail: detail.slice(0, 500), at: serverTimestamp() };
}

/** 관리자 기록 하나(따로 쓸 때) */
export async function logAdmin(action: string, target: string, detail = ''): Promise<void> {
  const batch = writeBatch(firestore());
  batch.set(doc(collection(firestore(), 'adminLogs')), logEntry(action, target, detail));
  await batch.commit();
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
  // 공지 화면은 이 보기 하나만 읽는다(읽기 1) — 원본과 같은 묶음으로 갱신
  setNoticesView(batch, next);
  batch.set(doc(collection(db, 'adminLogs')), logEntry(input ? (id ? 'update-notice' : 'create-notice') : 'delete-notice', ref.id, input?.title ?? ''));
  await batch.commit();
  return ref.id;
}

/** 공지 보기가 아직 없을 때 한 번 — 원본을 읽어(최대 100) 보기를 만든다 */
export async function seedNoticesView(): Promise<Notice[]> {
  const notices = await loadNotices();
  const batch = writeBatch(firestore());
  setNoticesView(batch, notices);
  await batch.commit();
  return notices;
}

// ── 회원 상세의 최근 경기(누를 때만) ─────────────────────────────────────────
export interface RecentGame {
  id: string;
  createdAt: number;
  mode: string;
  pa: number;
  runs: number;
  correct: number;
}

/** 회원 한 명의 최근 경기 10개 — 읽기 10, 관리자 기록 1 */
export async function loadRecentGames(uid: string): Promise<RecentGame[]> {
  const db = firestore();
  const snapshot = await getDocs(query(collection(db, 'users', uid, 'games'), orderBy('createdAt', 'desc'), limit(10)));
  await logAdmin('view-member-games', uid, `${snapshot.size}경기`);
  return snapshot.docs.map((item) => {
    const atBats = Array.isArray(item.get('atBats')) ? (item.get('atBats') as { correct?: boolean }[]) : [];
    return {
      id: item.id,
      createdAt: ms(item.get('createdAt')),
      mode: String(item.get('mode') ?? ''),
      pa: Number(item.get('pa') ?? 0),
      runs: Number(item.get('runs') ?? 0),
      correct: atBats.filter((atBat) => atBat.correct).length,
    };
  });
}

// ── 이벤트(출석 2배 날·공식전 문항 현황) — docs/engagement-plan.md §6 ─────────────────────
export interface EventsConfig {
  /** 출석 2배 날 "YYYY-MM-DD" */
  doubleDays: string[];
  updatedAt: number;
  /** 운영자 PC가 쓰는 공식전 문항 현황(ops/official.mjs) */
  official: { remaining: number; daysLeft: number; short: string[]; problems: number; updatedAt: number } | null;
}

/** 이벤트 설정 — 문서 하나(읽기 1) */
export async function loadEvents(): Promise<EventsConfig> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'events'));
  const official = snapshot.get('official') as Record<string, unknown> | undefined;
  return {
    doubleDays: Array.isArray(snapshot.get('doubleDays')) ? (snapshot.get('doubleDays') as unknown[]).map(String) : [],
    updatedAt: ms(snapshot.get('updatedAt')),
    official: official
      ? {
          remaining: Number(official.remaining ?? 0),
          daysLeft: Number(official.daysLeft ?? 0),
          short: Array.isArray(official.short) ? official.short.map(String) : [],
          problems: Number(official.problems ?? 0),
          updatedAt: ms(official.updatedAt),
        }
      : null,
  };
}

/** 출석 2배 날 저장 + 관리자 기록. 다음 새벽 등수 작업부터 반영 */
export async function saveDoubleDays(days: readonly string[]): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'adminConfig', 'events'), { doubleDays: [...days], updatedAt: serverTimestamp(), by: uidNow() }, { merge: true });
  batch.set(doc(collection(db, 'adminLogs')), logEntry('set-double-days', 'events', days.join(',')));
  await batch.commit();
}

// ── 최신 소식(docs/news.md) — 글은 adminConfig/news 한 문서(읽기 1). 매일 새벽 운영자 PC가 글마다 출처·날짜를 확인해
// 통과한 글만 이용자 앱 공개 문서(public/news)에 올린다(ops/news.mjs) ─────────────────────
export interface NewsCheck {
  ok: boolean;
  reason: string;
  at: number;
}
export interface NewsConfig {
  posts: (NewsPost & { hidden: boolean })[];
  checks: Record<string, NewsCheck>;
  checkedAt: number;
}

export async function loadNewsConfig(): Promise<NewsConfig> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'news'));
  const posts = Array.isArray(snapshot.get('posts')) ? (snapshot.get('posts') as (NewsPost & { hidden?: boolean })[]) : [];
  const checks: Record<string, NewsCheck> = {};
  for (const [id, value] of Object.entries((snapshot.get('checks') ?? {}) as Record<string, Record<string, unknown>>)) {
    checks[id] = { ok: value.ok === true, reason: String(value.reason ?? ''), at: ms(value.at) };
  }
  return { posts: posts.map((post) => ({ ...post, hidden: post.hidden === true })), checks, checkedAt: ms(snapshot.get('checkedAt')) };
}

/** 글 목록 저장 + 관리자 기록. 앱에는 다음 확인 작업(매일 새벽, 또는 운영자 PC에서 admin-cli news) 뒤에 보인다 */
export async function saveNewsPosts(posts: readonly (NewsPost & { hidden: boolean })[], action: string, target: string): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'adminConfig', 'news'), { posts: posts.map((post) => ({ ...post })), updatedAt: serverTimestamp(), by: uidNow() }, { merge: true });
  batch.set(doc(collection(db, 'adminLogs')), logEntry(action, target));
  await batch.commit();
}
