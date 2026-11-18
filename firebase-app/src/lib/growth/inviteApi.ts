import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites, queryReads } from '@/lib/firebase/meter';
import {
  clearPendingInvite,
  INVITE_LINK_WITHIN_DAYS,
  invitesOpen,
  isInviteCode,
  makeInviteCode,
  normalizeInviteCode,
  pendingInvite,
  type InviteStatus,
} from './invite';

/**
 * 친구 초대 읽기·쓰기(invite.ts의 Firebase 쪽). 보상·활동 확인은 기기가 하지 않는다 — 운영자 PC 0시 작업(ops/invite.mjs)이
 * inviteLedger와 users/{uid}/meta/invites를 쓰고, 기기는 읽기만 한다(firestore.rules).
 */

export interface MyInvite {
  code: string | null;
  invitedBy: string | null;
  /** 이 계정이 남의 코드를 넣을 수 있는지(가입 후 7일 안, 아직 연결 안 함) */
  canLink: boolean;
}

export interface InviteRow {
  nickname: string;
  status: InviteStatus;
  inviterPoints: number;
}

export interface InviteSummary {
  rewarded: number;
  bonus: number;
  titles: string[];
}

export class InviteLinkError extends Error {}

/** 내 코드·연결 상태 — 읽기 1번 */
export async function loadMyInvite(uid: string, now: number = Date.now()): Promise<MyInvite> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid));
  countReads('loadMyInvite', 1);
  const created = snapshot.get('createdAt')?.toMillis?.() ?? 0;
  const invitedBy = (snapshot.get('invitedBy') as string | undefined) ?? null;
  return {
    code: (snapshot.get('inviteCode') as string | undefined) ?? null,
    invitedBy,
    canLink: invitedBy === null && created > 0 && now - created < INVITE_LINK_WITHIN_DAYS * 86_400_000,
  };
}

/** 내 초대 코드 — 없으면 만든다(겹치면 다른 코드로 다시, 최대 5번). 쓰기 2번 */
export async function ensureInviteCode(uid: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const db = firestore();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeInviteCode();
    const batch = writeBatch(db);
    batch.set(doc(db, 'invites', code), { uid, createdAt: serverTimestamp() });
    batch.update(doc(db, 'users', uid), { inviteCode: code, updatedAt: serverTimestamp() });
    try {
      await batch.commit();
      countWrites('ensureInviteCode', 2);
      return code;
    } catch (error) {
      if ((error as { code?: string }).code !== 'permission-denied') throw error;
      // 규칙이 막는 두 경우: 다른 화면(두 번 그려진 화면 등)이 먼저 내 코드를 만들었거나, 같은 코드가 이미 있다
      const now = await getDoc(doc(db, 'users', uid));
      countReads('ensureInviteCode', 1);
      const made = now.get('inviteCode') as string | undefined;
      if (made) return made;
    }
  }
  throw new Error('초대 코드를 만들지 못했어요. 잠시 뒤 다시 해 주세요.');
}

/** 받은 초대 코드를 내 계정에 한 번 연결 — 읽기 1번(코드 확인), 쓰기 1번 */
export async function linkInvite(uid: string, rawCode: string): Promise<string> {
  const code = normalizeInviteCode(rawCode);
  if (!code) throw new InviteLinkError('초대 코드는 영문·숫자 6자리예요.');
  const db = firestore();
  const invite = await getDoc(doc(db, 'invites', code));
  countReads('linkInvite', 1);
  if (!invite.exists()) throw new InviteLinkError('없는 초대 코드예요. 다시 확인해 주세요.');
  if (invite.get('uid') === uid) throw new InviteLinkError('내 초대 코드는 넣을 수 없어요.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), { invitedBy: code, invitedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  try {
    await batch.commit();
    countWrites('linkInvite', 1);
  } catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') {
      throw new InviteLinkError('초대 코드는 가입 후 7일 안에 한 번만 넣을 수 있어요.');
    }
    throw error;
  }
  return code;
}

/**
 * 가입(닉네임 저장)이 끝난 뒤 한 번 — 링크로 받아 기기에 둔 코드를 연결한다. 실패해도 가입은 그대로(조용히).
 * 연결했거나 다시 해도 안 되는 경우(없는 코드·내 코드·기간 지남)에는 기기에서 지운다.
 */
export async function linkPendingInvite(uid: string, now: number = Date.now()): Promise<string | null> {
  if (!invitesOpen(now)) return null;
  const code = pendingInvite(now);
  if (!code || !isInviteCode(code)) return null;
  try {
    const linked = await linkInvite(uid, code);
    clearPendingInvite();
    return linked;
  } catch (error) {
    if (error instanceof InviteLinkError) clearPendingInvite();
    return null;
  }
}

/** 내가 초대한 친구 목록(최근 50명)과 보너스 합계 — 읽기: 문서 수(최소 1) + 1 */
export async function loadInviteStatus(uid: string): Promise<{ rows: InviteRow[]; summary: InviteSummary }> {
  const db = firestore();
  const [ledger, meta] = await Promise.all([
    getDocs(query(collection(db, 'inviteLedger'), where('inviter', '==', uid), limit(50))),
    getDoc(doc(db, 'users', uid, 'meta', 'invites')),
  ]);
  countReads('loadInviteStatus', queryReads(ledger.size) + 1);
  const rows = ledger.docs
    .map((item) => ({
      nickname: String(item.get('nickname') ?? '회원'),
      status: (item.get('status') as InviteStatus) ?? 'joined',
      inviterPoints: Number(item.get('inviterPoints') ?? 0),
      linkedDay: String(item.get('linkedDay') ?? ''),
    }))
    .sort((a, b) => b.linkedDay.localeCompare(a.linkedDay))
    .map(({ nickname, status, inviterPoints }) => ({ nickname, status, inviterPoints }));
  return {
    rows,
    summary: {
      rewarded: Number(meta.get('rewarded') ?? 0),
      bonus: Number(meta.get('bonus') ?? 0),
      titles: (meta.get('titles') as string[] | undefined) ?? [],
    },
  };
}
