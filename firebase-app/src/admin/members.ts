import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { GUARDIAN_WAIT_DAYS, isGuardianEmail, normalizeEmail } from '@/lib/auth/guardian';
import { firestore } from '@/lib/firebase/db';
import { firebaseAuth } from '@/lib/firebase/auth';
import { SQUAD_START, squadKindName, toLogo, type SquadLogo } from '@/lib/squad/squad';

/**
 * 가입자 관리(관리자 사이트 2차, 2026-11-23) — 회원 한 명의 더 보기, 조치(작업 요청·월간 등수 숨김), 보호자 동의 승인, 팀 이름 숨기기.
 *
 * - 기록·점수는 고치지 않는다. 이용약관이 확정되기 전이라 **제재(닉네임 초기화·정지)는 없다** — 계정 삭제는 본인·보호자 요청과
 *   만 14세 미만 의심·보호자 동의 거절만(docs/admin-plan.md §5.4)
 * - 로그인 계정 삭제처럼 서버 권한이 필요한 일은 `adminTasks`로 남기고 운영자 PC가 처리한다(ops/admin.mjs — 매일 0시, 급하면 `admin-cli tasks`)
 * - 개인정보를 보거나 바꾸는 행동은 같은 묶음 안에서 `adminLogs`에 남긴다(접속기록, 2년)
 */
const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);
const uidNow = () => firebaseAuth().currentUser!.uid;
const logEntry = (action: string, target: string, detail = '') => ({ by: uidNow(), action, target, detail: detail.slice(0, 500), at: serverTimestamp() });

// ── 회원 한 명 더 보기 ───────────────────────────────────────────────────────
export type SquadRole = 'captain' | 'coach' | 'player' | 'pending';

export interface MemberExtras {
  wallet: { earned: number; spent: number } | null;
  inviteBonus: number;
  invitesRewarded: number;
  invitedCount: number;
  squadBonus: number;
  squad: { code: string; name: string; kind: string; role: SquadRole; size: number } | null;
  tasks: MemberTask[];
}

export interface MemberTask {
  id: string;
  type: string;
  status: string;
  detail: string;
  requestedAt: number;
  result: string | null;
}

/** 지갑·초대·팀·이 회원에게 걸린 작업 — 읽기 약 7 + 관리자 기록 1 */
export async function loadMemberExtras(uid: string, squadCode: string | null): Promise<MemberExtras> {
  const db = firestore();
  const [wallet, invites, squads, invited, tasks] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'wallet', 'main')),
    getDoc(doc(db, 'users', uid, 'meta', 'invites')),
    getDoc(doc(db, 'users', uid, 'meta', 'squads')),
    getCountFromServer(query(collection(db, 'inviteLedger'), where('inviter', '==', uid))),
    getDocs(query(collection(db, 'adminTasks'), where('target', '==', uid))),
  ]);
  let squad: MemberExtras['squad'] = null;
  if (squadCode) {
    const [team, member] = await Promise.all([getDoc(doc(db, 'squads', squadCode)), getDoc(doc(db, 'squads', squadCode, 'members', uid))]);
    if (team.exists()) {
      const role: SquadRole = !member.exists() ? 'pending' : team.get('captain') === uid ? 'captain' : team.get('coach') === uid ? 'coach' : 'player';
      squad = { code: squadCode, name: String(team.get('name') ?? ''), kind: String(team.get('kind') ?? ''), role, size: Number(team.get('size') ?? 0) };
    }
  }
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'adminLogs')), logEntry('view-member-extras', uid));
  await batch.commit();
  return {
    wallet: wallet.exists() ? { earned: Number(wallet.get('earned') ?? 0), spent: Number(wallet.get('spent') ?? 0) } : null,
    inviteBonus: Number(invites.get('bonus') ?? 0),
    invitesRewarded: Number(invites.get('rewarded') ?? 0),
    invitedCount: invited.data().count,
    squadBonus: Number(squads.get('bonus') ?? 0),
    squad,
    tasks: tasks.docs
      .map((item) => ({
        id: item.id,
        type: String(item.get('type') ?? ''),
        status: String(item.get('status') ?? ''),
        detail: String(item.get('detail') ?? ''),
        requestedAt: ms(item.get('requestedAt')),
        result: typeof item.get('result') === 'string' ? (item.get('result') as string) : null,
      }))
      .sort((a, b) => b.requestedAt - a.requestedAt),
  };
}

export const ROLE_LABEL: Record<SquadRole, string> = { captain: '감독', coach: '코치', player: '팀원', pending: '합류 신청 중' };
export const squadLabel = (squad: NonNullable<MemberExtras['squad']>) =>
  `${squad.name} (${squadKindName(squad.kind)}, ${squad.size}명) · ${ROLE_LABEL[squad.role]}`;

// ── 조치 ─────────────────────────────────────────────────────────────────────
/** 계정 삭제 사유 — 이용약관 확정 전에는 이것만(제재 삭제 없음). firestore.rules의 목록과 같아야 한다 */
export const DELETE_REASONS = ['본인 요청', '보호자 요청', '만 14세 미만 의심', '보호자 동의 거절'] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

export const TASK_LABEL: Record<string, string> = { deleteAccount: '계정 삭제', revokeInvite: '초대 보상 취소', syncAccounts: '계정 동기화' };
export const TASK_STATUS_LABEL: Record<string, string> = { pending: '운영자 PC 처리 기다림', done: '처리됨', failed: '실패' };

async function requestTask(type: 'deleteAccount' | 'revokeInvite', uid: string, detail: string, action: string) {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'adminTasks')), { type, target: uid, detail, status: 'pending', by: uidNow(), requestedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'adminLogs')), logEntry(action, uid, detail));
  await batch.commit();
}

/** 계정 삭제 요청 — 운영자 PC가 기록·팀 자리·닉네임 예약·초대 코드·로그인 계정을 지운다 */
export const requestAccountDeletion = (uid: string, reason: DeleteReason) => requestTask('deleteAccount', uid, reason, 'request-delete');

/** 부정으로 본 초대의 보상 취소 — 이 회원이 '초대받은 사람'인 초대(운영자 PC의 invite-revoke와 같다) */
export const requestInviteRevoke = (uid: string) => requestTask('revokeInvite', uid, '부정 초대 의심', 'request-invite-revoke');

/** 월간 등수에서 닉네임 숨기기·보이기(본인 요청 대행). 다음 0시 등수부터 */
export async function setRankingHidden(uid: string, hidden: boolean): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), { rankingHidden: hidden });
  batch.set(doc(collection(db, 'adminLogs')), logEntry(hidden ? 'ranking-hide' : 'ranking-show', uid, '본인 요청 대행'));
  await batch.commit();
}

// ── 보호자 동의(만 14세 미만) ─────────────────────────────────────────────────
export interface GuardianRequest {
  uid: string;
  code: string;
  email: string;
  requestedAt: number;
  deadline: number;
}

/** 동의를 기다리는 자녀 계정 — 응답 시각이 있는 프로필(관리자 목록) + 그 사람마다 보호자 신청서 1 */
export async function loadGuardianRequests(): Promise<GuardianRequest[]> {
  const db = firestore();
  const snapshot = await getDocs(query(collection(db, 'users'), where('under14At', '!=', null)));
  const pending = snapshot.docs.filter((item) => item.get('guardianConsentAt') == null);
  const rows = await Promise.all(
    pending.map(async (item) => {
      const guardian = await getDoc(doc(db, 'users', item.id, 'private', 'guardian'));
      const requestedAt = ms(item.get('under14At'));
      return {
        uid: item.id,
        code: String(guardian.get('code') ?? ''),
        email: String(guardian.get('email') ?? ''),
        requestedAt,
        deadline: requestedAt + GUARDIAN_WAIT_DAYS * 86_400_000,
      };
    }),
  );
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'adminLogs')), logEntry('view-guardians', 'guardians', `${rows.length}건`));
  await batch.commit();
  return rows.sort((a, b) => a.requestedAt - b.requestedAt);
}

export class GuardianApproveError extends Error {}

/** 승인 전 확인(순수 함수) — 받은 메일의 보낸 주소·동의 코드·기한. 문제가 없으면 null */
export function guardianApproveProblem(request: Pick<GuardianRequest, 'code' | 'email' | 'deadline'>, input: { code: string; senderEmail: string }, now: number): string | null {
  const sender = normalizeEmail(input.senderEmail);
  if (!isGuardianEmail(sender)) return '받은 메일의 보낸 주소를 적어 주세요.';
  if (input.code.trim().toUpperCase() !== request.code) return '동의 코드가 달라요. 메일 제목의 코드를 확인해 주세요.';
  if (sender !== normalizeEmail(request.email)) return '보낸 주소가 자녀가 적은 보호자 주소와 달라요 — 승인하지 않았어요.';
  if (now > request.deadline) return `기한(${GUARDIAN_WAIT_DAYS}일)이 지났어요 — 자녀가 다시 신청해야 해요.`;
  return null;
}

/**
 * 보호자 동의 승인 — 프로필의 동의 시각·판 + 신청서의 동의 시각 + 관리자 기록을 한 묶음으로(규칙이 관리자에게 이 칸만 연다).
 * 승인한 뒤 운영자가 보호자에게 확인 메일로 답한다
 */
export async function approveGuardianRequest(request: GuardianRequest, input: { code: string; senderEmail: string }, now = Date.now()): Promise<void> {
  const problem = guardianApproveProblem(request, input, now);
  if (problem) throw new GuardianApproveError(problem);
  const db = firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', request.uid), { guardianConsentAt: serverTimestamp(), guardianConsentVersion: SQUAD_START });
  batch.update(doc(db, 'users', request.uid, 'private', 'guardian'), { consentedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'adminLogs')), logEntry('guardian-approve', request.uid, `동의 코드 ${request.code}`));
  await batch.commit();
}

// ── 팀 ───────────────────────────────────────────────────────────────────────
export interface SquadRow {
  code: string;
  name: string;
  hidden: boolean;
  kind: string;
  size: number;
  logo: SquadLogo;
  createdAt: number;
  badge: number | null;
}

/** 팀 목록 — 읽기 팀 수(관리자만 목록을 읽는다) */
export async function loadSquads(): Promise<SquadRow[]> {
  const snapshot = await getDocs(collection(firestore(), 'squads'));
  return snapshot.docs
    .map((item) => ({
      code: item.id,
      name: String(item.get('name') ?? ''),
      hidden: item.get('hidden') === true,
      kind: String(item.get('kind') ?? ''),
      size: Number(item.get('size') ?? 0),
      logo: toLogo(item.get('logo')),
      createdAt: ms(item.get('createdAt')),
      badge: typeof item.get('badge')?.rank === 'number' ? (item.get('badge').rank as number) : null,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 팀 이름 숨기기·보이기(비속어·사칭) — 숨기면 다른 사람에게 '이름을 가린 팀'으로 보인다 */
export async function setSquadHidden(row: SquadRow, hidden: boolean): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'squads', row.code), { hidden });
  batch.set(doc(collection(db, 'adminLogs')), logEntry(hidden ? 'squad-hide' : 'squad-show', row.code, row.name.slice(0, 100)));
  await batch.commit();
}
