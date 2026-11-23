import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';
import {
  HIDDEN_SQUAD_NAME,
  makeSquadCode,
  normalizeSquadCode,
  isSquadCode,
  SQUAD_MAX,
  SQUAD_REJOIN_DAYS,
  toLogo,
  type SquadKind,
  type SquadLogo,
} from './squad';

/**
 * 팀(2단계) 읽기·쓰기 — 모든 쓰기는 한 묶음(batch)이고, 규칙(firestore.rules squads)이 묶음 안의 짝을 확인한다:
 * 팀 문서의 인원(size)·변경 표시(op)와 팀원 자리 생기기·없어지기, 내 프로필의 팀 코드(squad)·나간 시각(squadLeftAt).
 * 읽기 비용: 내 팀 화면 = 팀 1 + 팀원 최대 9 + (감독·코치면) 신청 목록 + 이번 주 기록 1.
 */

export interface SquadView {
  code: string;
  name: string;
  /** 운영자가 이름을 숨겼는지 — 숨긴 팀은 다른 사람에게 HIDDEN_SQUAD_NAME으로 보인다 */
  hidden: boolean;
  kind: SquadKind;
  logo: SquadLogo;
  captain: string;
  coach: string | null;
  size: number;
  /** 지난주 리그 순위 배지(1~3) */
  badge: number | null;
}

export interface MemberView {
  uid: string;
  nickname: string;
  joinedAt: number;
  child: boolean;
}

export interface RequestView {
  uid: string;
  nickname: string;
  child: boolean;
  requestedAt: number;
}

export type MySquad =
  | { state: 'none' }
  | { state: 'pending'; squad: SquadView }
  | { state: 'member'; squad: SquadView; members: MemberView[]; requests: RequestView[] };

export class SquadError extends Error {}

const ms = (value: unknown) => (value && typeof (value as { toMillis?: () => number }).toMillis === 'function' ? (value as { toMillis: () => number }).toMillis() : 0);

const squadRef = (code: string) => doc(firestore(), 'squads', code);
const memberRef = (code: string, uid: string) => doc(firestore(), 'squads', code, 'members', uid);
const requestRef = (code: string, uid: string) => doc(firestore(), 'squads', code, 'requests', uid);
const userRef = (uid: string) => doc(firestore(), 'users', uid);

export function toSquadView(code: string, data: DocumentData): SquadView {
  const hidden = data.hidden === true;
  const badge = data.badge && typeof data.badge.rank === 'number' ? data.badge.rank : null;
  return {
    code,
    name: hidden ? HIDDEN_SQUAD_NAME : String(data.name ?? ''),
    hidden,
    kind: (data.kind ?? 'friends') as SquadKind,
    logo: toLogo(data.logo),
    captain: String(data.captain ?? ''),
    coach: typeof data.coach === 'string' ? data.coach : null,
    size: Number(data.size ?? 0),
    badge,
  };
}

export async function loadSquad(code: string): Promise<SquadView | null> {
  const snapshot = await getDoc(squadRef(code));
  countReads('loadSquad', 1);
  return snapshot.exists() ? toSquadView(code, snapshot.data()) : null;
}

async function loadMembers(code: string): Promise<MemberView[]> {
  const snapshot = await getDocs(collection(firestore(), 'squads', code, 'members'));
  countReads('loadMembers', Math.max(1, snapshot.size));
  return snapshot.docs
    .map((item) => ({ uid: item.id, nickname: String(item.get('nickname') ?? ''), joinedAt: ms(item.get('joinedAt')), child: item.get('child') === true }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

async function loadRequests(code: string): Promise<RequestView[]> {
  const snapshot = await getDocs(collection(firestore(), 'squads', code, 'requests'));
  countReads('loadRequests', Math.max(1, snapshot.size));
  return snapshot.docs
    .map((item) => ({ uid: item.id, nickname: String(item.get('nickname') ?? ''), child: item.get('child') === true, requestedAt: ms(item.get('requestedAt')) }))
    .sort((a, b) => a.requestedAt - b.requestedAt);
}

/** 내 프로필의 팀 코드로 내 팀을 읽는다. 팀이 없어졌거나 신청이 거절·내보내졌으면 코드를 비운다 */
export async function loadMySquad(uid: string, pointer: string | null): Promise<MySquad> {
  if (!pointer) return { state: 'none' };
  const squad = await loadSquad(pointer);
  if (squad) {
    const mine = await getDoc(memberRef(pointer, uid)).catch(() => null);
    countReads('loadMySquad', 1);
    if (mine?.exists()) {
      const members = await loadMembers(pointer);
      const staff = squad.captain === uid || squad.coach === uid;
      return { state: 'member', squad, members, requests: staff ? await loadRequests(pointer) : [] };
    }
    const request = await getDoc(requestRef(pointer, uid)).catch(() => null);
    countReads('loadMySquad', 1);
    if (request?.exists()) return { state: 'pending', squad };
  }
  await clearPointer(uid);
  return { state: 'none' };
}

/** 프로필의 팀 코드 비우기(팀이 없어졌거나 신청이 거절됐거나 내보내졌을 때) */
export async function clearPointer(uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.update(userRef(uid), { squad: null, updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('clearSquadPointer', 1);
}

export function rejoinBlockedUntil(leftAt: number | null, now = Date.now()): number | null {
  if (!leftAt) return null;
  const until = leftAt + SQUAD_REJOIN_DAYS * 86_400_000;
  return until > now ? until : null;
}

/** 팀 만들기 = 팀 + 감독 자리 + 내 팀 코드(한 묶음). 코드가 겹치면 규칙이 거절하므로 새 코드로 다시 해 본다 */
export async function createSquad(uid: string, nickname: string, input: { name: string; kind: SquadKind; logo: SquadLogo }): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = makeSquadCode();
    const batch = writeBatch(firestore());
    batch.set(squadRef(code), {
      name: input.name.trim(),
      kind: input.kind,
      logo: input.logo,
      captain: uid,
      coach: null,
      size: 1,
      op: { uid, t: 'in' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(memberRef(code, uid), { nickname, joinedAt: serverTimestamp(), child: false });
    batch.update(userRef(uid), { squad: code, updatedAt: serverTimestamp() });
    try {
      await batch.commit();
      countWrites('createSquad', 3);
      return code;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** 합류 신청 = 신청서 + 내 팀 코드(한 묶음). 다른 팀에 낸 신청이 있으면 함께 거둔다 */
export async function requestJoin(uid: string, nickname: string, child: boolean, rawCode: string, previous: string | null): Promise<SquadView> {
  const code = normalizeSquadCode(rawCode);
  if (!isSquadCode(code)) throw new SquadError('팀 코드는 6자리예요(0·O·1·I는 쓰지 않아요).');
  const squad = await loadSquad(code).catch(() => null);
  if (!squad) throw new SquadError('없는 팀 코드예요. 다시 확인해 주세요.');
  if (squad.size >= SQUAD_MAX) throw new SquadError(`이 팀은 ${SQUAD_MAX}명이 다 찼어요.`);
  if (child && squad.kind !== 'family') throw new SquadError('보호자 동의 계정은 가족팀에만 들어갈 수 있어요.');
  const batch = writeBatch(firestore());
  if (previous && previous !== code) batch.delete(requestRef(previous, uid));
  batch.set(requestRef(code, uid), { nickname, child, requestedAt: serverTimestamp() });
  batch.update(userRef(uid), { squad: code, updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('requestJoin', previous && previous !== code ? 3 : 2);
  return squad;
}

export async function cancelRequest(uid: string, code: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(requestRef(code, uid));
  batch.update(userRef(uid), { squad: null, updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('cancelRequest', 2);
}

/** 합류 승인(감독·코치) = 팀원 자리 + 신청서 지우기 + 인원 하나 늘리기 */
export async function approveRequest(squad: SquadView, request: RequestView): Promise<void> {
  if (squad.size >= SQUAD_MAX) throw new SquadError(`팀은 ${SQUAD_MAX}명까지예요.`);
  const batch = writeBatch(firestore());
  batch.set(memberRef(squad.code, request.uid), { nickname: request.nickname, joinedAt: serverTimestamp(), child: request.child });
  batch.delete(requestRef(squad.code, request.uid));
  batch.update(squadRef(squad.code), { size: squad.size + 1, op: { uid: request.uid, t: 'in' }, updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('approveRequest', 3);
}

export async function rejectRequest(code: string, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(requestRef(code, uid));
  await batch.commit();
  countWrites('rejectRequest', 1);
}

/** 감독이 나가면 이어받을 사람 — 가장 먼저 들어온 팀원(자녀 계정 제외). 없으면 null */
export function nextCaptain(members: readonly MemberView[], leaving: string): string | null {
  return members.find((member) => member.uid !== leaving && !member.child)?.uid ?? null;
}

/**
 * 나가기 = 내 자리 지우기 + 인원 하나 줄이기 + 내 팀 코드 비우기·나간 시각(한 묶음).
 * 감독이면 감독을 넘기고, 혼자 남은 감독이면 팀을 없앤다. 자녀 계정만 남으면 감독은 나갈 수 없다(먼저 내보내기).
 */
export async function leaveSquad(uid: string, squad: SquadView, members: readonly MemberView[]): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(memberRef(squad.code, uid));
  if (squad.size <= 1 || members.length <= 1) {
    batch.delete(squadRef(squad.code));
  } else {
    const captain = squad.captain === uid ? nextCaptain(members, uid) : squad.captain;
    if (!captain) throw new SquadError('남은 팀원이 모두 보호자 동의 계정이라 감독을 넘길 수 없어요. 먼저 내보낸 뒤 나가 주세요.');
    batch.update(squadRef(squad.code), {
      size: squad.size - 1,
      op: { uid, t: 'out' },
      captain,
      coach: squad.coach === uid || squad.coach === captain ? null : squad.coach,
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(userRef(uid), { squad: null, squadLeftAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('leaveSquad', 3);
}

/** 내보내기(감독) = 그 사람 자리 지우기 + 인원 하나 줄이기. 그 사람 프로필의 팀 코드는 다음에 열 때 본인 기기가 비운다 */
export async function kickMember(squad: SquadView, uid: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(memberRef(squad.code, uid));
  batch.update(squadRef(squad.code), {
    size: squad.size - 1,
    op: { uid, t: 'out' },
    coach: squad.coach === uid ? null : squad.coach,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  countWrites('kickMember', 2);
}

/** 감독: 이름·로고·코치·감독 넘기기 */
export async function editSquad(code: string, change: Partial<{ name: string; logo: SquadLogo; coach: string | null; captain: string }>): Promise<void> {
  const batch = writeBatch(firestore());
  batch.update(squadRef(code), { ...change, ...(change.name ? { name: change.name.trim() } : {}), updatedAt: serverTimestamp() });
  await batch.commit();
  countWrites('editSquad', 1);
}

// ── 팀 주간 리그(3단계) — 운영자 PC 0시 작업이 쓴 문서를 읽기만 ───────────────
export interface LeagueRow {
  rank: number;
  code: string;
  name: string;
  kind: SquadKind;
  logo: SquadLogo;
  score: number;
  players: number;
  size: number;
}

export interface LeagueView {
  week: string;
  through: string | null;
  final: boolean;
  count: number;
  rows: LeagueRow[];
}

export interface WeekContribution {
  score: number;
  rank: number | null;
  members: { nickname: string; points: number; days: number }[];
}

let leagueMemory: { week: string; at: number; value: LeagueView | null } | null = null;
const LEAGUE_CACHE_MS = 10 * 60_000;

export async function loadLeague(week: string): Promise<LeagueView | null> {
  if (leagueMemory && leagueMemory.week === week && Date.now() - leagueMemory.at < LEAGUE_CACHE_MS) return leagueMemory.value;
  const snapshot = await getDoc(doc(firestore(), 'squadLeague', week));
  countReads('loadLeague', 1);
  const value: LeagueView | null = snapshot.exists()
    ? {
        week,
        through: typeof snapshot.get('through') === 'string' ? snapshot.get('through') : null,
        final: snapshot.get('final') === true,
        count: Number(snapshot.get('count') ?? 0),
        rows: ((snapshot.get('squads') ?? []) as DocumentData[]).map((row, index) => ({
          rank: Number(row.rank ?? index + 1),
          code: String(row.code ?? ''),
          name: row.hidden === true ? HIDDEN_SQUAD_NAME : String(row.name ?? ''),
          kind: (row.kind ?? 'friends') as SquadKind,
          logo: toLogo(row.logo),
          score: Number(row.score ?? 0),
          players: Number(row.players ?? 0),
          size: Number(row.size ?? 0),
        })),
      }
    : null;
  leagueMemory = { week, at: Date.now(), value };
  return value;
}

export async function loadWeekContribution(code: string, week: string): Promise<WeekContribution | null> {
  const snapshot = await getDoc(doc(firestore(), 'squads', code, 'weeks', week));
  countReads('loadWeekContribution', 1);
  if (!snapshot.exists()) return null;
  return {
    score: Number(snapshot.get('score') ?? 0),
    rank: typeof snapshot.get('rank') === 'number' ? snapshot.get('rank') : null,
    members: ((snapshot.get('members') ?? []) as DocumentData[]).map((row) => ({
      nickname: String(row.nickname ?? ''),
      points: Number(row.points ?? 0),
      days: Number(row.days ?? 0),
    })),
  };
}

/** 내가 받은 팀 보너스 합계(운영자 PC가 쓴 users/{uid}/meta/squads) */
export async function loadSquadBonus(uid: string): Promise<number> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'meta', 'squads'));
  countReads('loadSquadBonus', 1);
  return Number(snapshot.get('bonus') ?? 0);
}
